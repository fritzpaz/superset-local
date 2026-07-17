import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
	assertAllowedUrl,
	DEFAULT_BLOCKED_HOSTS,
	hostFromUrl,
	isLoopbackHost,
} from "./policy.mjs";

const PACKAGE_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const COMPOSE_FILE = path.join(PACKAGE_ROOT, "assets", "compose.yaml");
const CONTRACT_FILE = path.join(
	PACKAGE_ROOT,
	"integration",
	"runtime-contract.json",
);
const CONFIG_VERSION = 1;

function usage() {
	return `superset-local <command> [options]

Commands:
  init       Create a local or external-infrastructure configuration
  doctor     Validate endpoints, cloud-disable flags, integration, and prerequisites
  build      Build the API/web appliance image
  up         Start locally managed backing services
  down       Stop locally managed backing services (data is retained)
  status     Show locally managed service status
  run -- CMD Run the Superset source tree with the generated environment
  config     Print the non-secret effective configuration

Common options:
  --config PATH                 Config file (default: ./superset-local.json)
  --json                        Machine-readable output where supported

init options:
  --profile local|external      Backing-service profile (default: local)
  --source-root PATH            Superset Local source checkout (default: config directory)
  --state-dir PATH              Secret/runtime state directory (default: .superset-local)
  --api-url URL                 Local API origin (default: http://127.0.0.1:3001)
  --web-url URL                 Local web origin (default: http://127.0.0.1:3000)
  --postgres-port PORT          Local Postgres port (default: 5432)
  --redis-port PORT             Local Redis port (default: 6379)
  --electric-port PORT          Local Electric port (default: 3100)
  --neon-proxy-port PORT        Local Neon compatibility port (default: 4444)
  --srh-port PORT               Local Redis HTTP compatibility port (default: 8079)
  --electric-proxy-port PORT    Local authenticated Electric proxy (default: 8787)
  --database-url URL            Required for the external profile
  --database-url-unpooled URL   Defaults to --database-url
  --redis-url URL               Required for the external profile
  --electric-url URL            Required for the external profile
  --electric-secret VALUE       Optional Electric auth secret for external infrastructure
  --admin-email EMAIL           Initial local administrator (default: admin@local.invalid)
  --admin-password VALUE        Initial password (default: generated)
  --allow-host HOST             Add an outbound allowlist host; repeatable
  --network-mode MODE           default-deny or deny-superset (default: default-deny)
  --non-interactive             Never prompt
  --force                       Replace an existing generated config

doctor options:
  --strict                      Treat warnings (including unwired upstream gates) as failures`;
}

function parseArgs(argv) {
	const result = { _: [], "allow-host": [] };
	const booleanOptions = new Set([
		"force",
		"json",
		"non-interactive",
		"strict",
		"help",
	]);
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--") {
			result._.push(...argv.slice(index));
			break;
		}
		if (!token.startsWith("--")) {
			result._.push(token);
			continue;
		}
		const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
		if (booleanOptions.has(rawKey)) {
			result[rawKey] = true;
			continue;
		}
		const value = inlineValue ?? argv[index + 1];
		if (value === undefined || value.startsWith("--"))
			throw new Error(`--${rawKey} needs a value`);
		if (inlineValue === undefined) index += 1;
		if (rawKey === "allow-host") result[rawKey].push(value);
		else result[rawKey] = value;
	}
	return result;
}

function randomSecret(bytes = 32) {
	return crypto.randomBytes(bytes).toString("base64url");
}

function quoteEnv(value) {
	return JSON.stringify(String(value));
}

export function serializeEnv(values) {
	return `${Object.entries(values)
		.map(([key, value]) => `${key}=${quoteEnv(value)}`)
		.join("\n")}\n`;
}

export function parseEnv(contents) {
	const values = {};
	for (const rawLine of contents.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const separator = line.indexOf("=");
		if (separator < 1) continue;
		const key = line.slice(0, separator).trim();
		const rawValue = line.slice(separator + 1).trim();
		try {
			values[key] = rawValue.startsWith('"') ? JSON.parse(rawValue) : rawValue;
		} catch {
			throw new Error(`invalid value for ${key} in runtime environment`);
		}
	}
	return values;
}

function writePrivateFile(file, contents, force) {
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	if (fs.existsSync(file) && !force)
		throw new Error(`${file} already exists; use --force to replace it`);
	const temporary = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(temporary, contents, { mode: 0o600 });
	fs.chmodSync(temporary, 0o600);
	fs.renameSync(temporary, file);
}

function configPathFrom(options) {
	return path.resolve(options.config ?? "superset-local.json");
}

function statePath(configFile, stateDir) {
	return path.resolve(path.dirname(configFile), stateDir);
}

function projectName(directory) {
	const base = path
		.basename(directory)
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-|-$/g, "");
	const hash = crypto
		.createHash("sha256")
		.update(directory)
		.digest("hex")
		.slice(0, 8);
	return `superset-local-${base || "app"}-${hash}`.slice(0, 63);
}

function portOption(options, name, fallback) {
	const value = Number(options[name] ?? fallback);
	if (!Number.isInteger(value) || value < 1 || value > 65535)
		throw new Error(`--${name} must be a port from 1 to 65535`);
	return value;
}

async function promptForMissing(options) {
	if (options["non-interactive"] || !process.stdin.isTTY) return options;
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	try {
		options.profile ||=
			(
				await rl.question("Backing services [local/external] (local): ")
			).trim() || "local";
		if (options.profile === "external") {
			options["database-url"] ||= (await rl.question("Postgres URL: ")).trim();
			options["database-url-unpooled"] ||=
				(await rl.question("Unpooled Postgres URL (same): ")).trim() ||
				options["database-url"];
			options["redis-url"] ||= (await rl.question("Redis URL: ")).trim();
			options["electric-url"] ||= (await rl.question("Electric URL: ")).trim();
		}
		options["api-url"] ||=
			(await rl.question("Local API URL (http://127.0.0.1:3001): ")).trim() ||
			"http://127.0.0.1:3001";
		options["web-url"] ||=
			(await rl.question("Local web URL (http://127.0.0.1:3000): ")).trim() ||
			"http://127.0.0.1:3000";
		return options;
	} finally {
		rl.close();
	}
}

function externalValue(options, option, environmentName) {
	return options[option] ?? process.env[environmentName];
}

export function buildConfiguration(
	options,
	configFile = configPathFrom(options),
) {
	const profile = options.profile ?? "local";
	if (!new Set(["local", "external"]).has(profile))
		throw new Error("--profile must be local or external");
	const networkMode = options["network-mode"] ?? "default-deny";
	if (!new Set(["default-deny", "deny-superset"]).has(networkMode)) {
		throw new Error("--network-mode must be default-deny or deny-superset");
	}

	const apiUrl = options["api-url"] ?? "http://127.0.0.1:3001";
	const webUrl = options["web-url"] ?? "http://127.0.0.1:3000";
	const sourceRoot = path.resolve(
		options["source-root"] ?? path.dirname(configFile),
	);
	const stateDir = options["state-dir"] ?? ".superset-local";
	const runtimeDirectory = statePath(configFile, stateDir);
	const runtimeEnvFile = path.join(runtimeDirectory, "runtime.env");
	const allowHosts = new Set(options["allow-host"] ?? []);
	const postgresPort = portOption(options, "postgres-port", 5432);
	const redisPort = portOption(options, "redis-port", 6379);
	const electricPort = portOption(options, "electric-port", 3100);
	const neonProxyPort = portOption(options, "neon-proxy-port", 4444);
	const srhPort = portOption(options, "srh-port", 8079);
	const electricProxyPort = portOption(options, "electric-proxy-port", 8787);

	let databaseUrl;
	let databaseUrlUnpooled;
	let redisUrl;
	let electricUrl;
	const local = profile === "local";
	const postgresPassword = randomSecret(24);
	const redisPassword = randomSecret(24);

	if (local) {
		databaseUrl = `postgresql://superset_local:${postgresPassword}@127.0.0.1:${postgresPort}/superset_local`;
		databaseUrlUnpooled = databaseUrl;
		redisUrl = `redis://:${redisPassword}@127.0.0.1:${redisPort}/0`;
		electricUrl = `http://127.0.0.1:${electricPort}`;
	} else {
		databaseUrl = externalValue(options, "database-url", "DATABASE_URL");
		databaseUrlUnpooled =
			externalValue(
				options,
				"database-url-unpooled",
				"DATABASE_URL_UNPOOLED",
			) || databaseUrl;
		redisUrl = externalValue(options, "redis-url", "REDIS_URL");
		electricUrl = externalValue(options, "electric-url", "ELECTRIC_URL");
		const missing = [
			["--database-url", databaseUrl],
			["--redis-url", redisUrl],
			["--electric-url", electricUrl],
		]
			.filter(([, value]) => !value)
			.map(([name]) => name);
		if (missing.length)
			throw new Error(`external profile requires ${missing.join(", ")}`);
		for (const [label, value] of [
			["database URL", databaseUrl],
			["unpooled database URL", databaseUrlUnpooled],
			["Redis URL", redisUrl],
			["Electric URL", electricUrl],
		]) {
			const host = hostFromUrl(value, label);
			allowHosts.add(host);
		}
	}

	for (const [label, value] of [
		["API URL", apiUrl],
		["web URL", webUrl],
		["database URL", databaseUrl],
		["unpooled database URL", databaseUrlUnpooled],
		["Redis URL", redisUrl],
		["Electric URL", electricUrl],
	]) {
		assertAllowedUrl(value, {
			label,
			blockedHosts: DEFAULT_BLOCKED_HOSTS,
			networkMode,
			allowHosts: [...allowHosts],
		});
	}
	for (const [label, value] of [
		["API URL", apiUrl],
		["web URL", webUrl],
	]) {
		if (!isLoopbackHost(hostFromUrl(value, label)))
			throw new Error(`${label} must use a loopback host`);
	}

	const composeProject = projectName(path.dirname(configFile));
	const config = {
		schemaVersion: CONFIG_VERSION,
		product: "superset-local",
		profile,
		composeProject,
		sourceRoot,
		stateDir: path.relative(path.dirname(configFile), runtimeDirectory) || ".",
		runtimeEnvFile: path.relative(path.dirname(configFile), runtimeEnvFile),
		endpoints: { api: apiUrl, web: webUrl },
		localPorts: local
			? {
					postgres: postgresPort,
					redis: redisPort,
					electric: electricPort,
					neonProxy: neonProxyPort,
					srh: srhPort,
					electricProxy: electricProxyPort,
				}
			: null,
		services: {
			database: { mode: profile, secretEnv: "DATABASE_URL" },
			redis: { mode: profile, secretEnv: "REDIS_URL" },
			electric: { mode: profile, secretEnv: "ELECTRIC_URL" },
		},
		policy: {
			networkMode,
			blockedHosts: [...DEFAULT_BLOCKED_HOSTS],
			allowHosts: [...allowHosts].sort(),
			supersetCloud: false,
			relay: false,
			telemetry: false,
			autoUpdate: false,
		},
		integration: JSON.parse(fs.readFileSync(CONTRACT_FILE, "utf8")),
	};

	const electricSecret = randomSecret(32);
	const applicationElectricSecret = local
		? electricSecret
		: (externalValue(options, "electric-secret", "ELECTRIC_SECRET") ?? "");
	const environment = {
		SUP_LOCAL_RUNTIME_ENV_FILE: runtimeEnvFile,
		SUP_LOCAL_SOURCE_ROOT: sourceRoot,
		SUP_LOCAL_IMAGE_TAG: composeProject.replace(/^superset-local-/, ""),
		SUPERSET_LOCAL_MODE: "true",
		NEXT_PUBLIC_SUPERSET_LOCAL_MODE: "true",
		SUP_LOCAL_PROFILE: profile,
		SUP_LOCAL_CLOUD_DISABLED: "true",
		SUP_LOCAL_RELAY_DISABLED: "true",
		SUP_LOCAL_TELEMETRY_DISABLED: "true",
		SUP_LOCAL_AUTO_UPDATE_DISABLED: "true",
		SUPERSET_CLOUD_DISABLED: "true",
		SUPERSET_RELAY_DISABLED: "true",
		SUPERSET_TELEMETRY_DISABLED: "true",
		SUPERSET_AUTO_UPDATE_DISABLED: "true",
		SUPERSET_HOSTED_INTEGRATIONS_DISABLED: "true",
		DO_NOT_TRACK: "1",
		TURBO_TELEMETRY_DISABLED: "1",
		NEXT_TELEMETRY_DISABLED: "1",
		DATABASE_URL: databaseUrl,
		DATABASE_URL_UNPOOLED: databaseUrlUnpooled,
		REDIS_URL: redisUrl,
		ELECTRIC_URL: electricUrl,
		ELECTRIC_SECRET: applicationElectricSecret,
		NEXT_PUBLIC_ELECTRIC_URL: `http://127.0.0.1:${electricProxyPort}`,
		NEXT_PUBLIC_API_URL: apiUrl,
		SUPERSET_INTERNAL_API_URL: apiUrl,
		NEXT_PUBLIC_WEB_URL: webUrl,
		NEXT_PUBLIC_ADMIN_URL: webUrl,
		NEXT_PUBLIC_MARKETING_URL: webUrl,
		NEXT_PUBLIC_DOCS_URL: webUrl,
		NEXT_PUBLIC_RELAY_URL: "http://127.0.0.1:9",
		NEXT_PUBLIC_STREAMS_URL: apiUrl,
		NEXT_PUBLIC_POSTHOG_KEY: "phc_local_disabled",
		NEXT_PUBLIC_POSTHOG_HOST: "http://127.0.0.1:9",
		POSTHOG_API_KEY: "local-disabled",
		POSTHOG_API_HOST: "http://127.0.0.1:9",
		POSTHOG_PROJECT_ID: "0",
		NEXT_PUBLIC_COOKIE_DOMAIN: hostFromUrl(webUrl, "web URL"),
		RELAY_URL: "http://127.0.0.1:9",
		STREAMS_URL: apiUrl,
		DURABLE_STREAMS_URL: "http://127.0.0.1:9",
		DURABLE_STREAMS_SECRET: randomSecret(24),
		BETTER_AUTH_SECRET: randomSecret(32),
		SECRETS_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
		SUPERSET_LOCAL_ADMIN_EMAIL: options["admin-email"] ?? "admin@local.invalid",
		SUPERSET_LOCAL_ADMIN_PASSWORD:
			options["admin-password"] ?? randomSecret(24),
		SUPERSET_LOCAL_ADMIN_NAME: "Local Administrator",
		SUPERSET_BASE_URL: apiUrl,
		SUPERSET_RELAY_URL: "http://127.0.0.1:9",
		GOOGLE_CLIENT_ID: "local-disabled",
		GOOGLE_CLIENT_SECRET: "local-disabled",
		GH_CLIENT_ID: "local-disabled",
		GH_CLIENT_SECRET: "local-disabled",
		GH_APP_ID: "0",
		GH_APP_PRIVATE_KEY: "local-disabled",
		GH_WEBHOOK_SECRET: "local-disabled",
		LINEAR_CLIENT_ID: "local-disabled",
		LINEAR_CLIENT_SECRET: "local-disabled",
		LINEAR_WEBHOOK_SECRET: "local-disabled",
		SLACK_CLIENT_ID: "local-disabled",
		SLACK_CLIENT_SECRET: "local-disabled",
		SLACK_SIGNING_SECRET: "local-disabled",
		SLACK_BILLING_WEBHOOK_URL: "http://127.0.0.1:9",
		ANTHROPIC_API_KEY: "local-disabled",
		BLOB_READ_WRITE_TOKEN: "local-disabled",
		RESEND_API_KEY: "local-disabled",
		STRIPE_SECRET_KEY: "sk_test_local_disabled",
		STRIPE_WEBHOOK_SECRET: "whsec_local_disabled",
		STRIPE_PRO_MONTHLY_PRICE_ID: "price_local_disabled",
		STRIPE_PRO_YEARLY_PRICE_ID: "price_local_disabled",
		STRIPE_ENTERPRISE_YEARLY_PRICE_ID: "price_local_disabled",
		QSTASH_TOKEN: "local-disabled",
		QSTASH_URL: "http://127.0.0.1:9",
		QSTASH_CURRENT_SIGNING_KEY: "local-disabled",
		QSTASH_NEXT_SIGNING_KEY: "local-disabled",
		KV_REST_API_URL: `http://127.0.0.1:${srhPort}`,
		KV_REST_API_TOKEN: redisPassword,
		KV_URL: redisUrl,
		SUP_LOCAL_CONTAINER_DATABASE_URL: local
			? `postgresql://superset_local:${postgresPassword}@db.localtest.me:4444/superset_local`
			: databaseUrl,
		SUP_LOCAL_CONTAINER_DATABASE_URL_UNPOOLED: local
			? `postgresql://superset_local:${postgresPassword}@postgres:5432/superset_local`
			: databaseUrlUnpooled,
		SUP_LOCAL_CONTAINER_REDIS_URL: local
			? `redis://:${redisPassword}@redis:6379/0`
			: redisUrl,
		SUP_LOCAL_CONTAINER_ELECTRIC_URL: local
			? "http://electric:3000"
			: electricUrl,
		SUP_LOCAL_CONTAINER_KV_REST_API_URL: local
			? "http://serverless-redis-http"
			: "http://serverless-redis-http",
		SUP_LOCAL_POSTGRES_USER: "superset_local",
		SUP_LOCAL_API_PORT:
			new URL(apiUrl).port ||
			(new URL(apiUrl).protocol === "https:" ? "443" : "80"),
		SUP_LOCAL_WEB_PORT:
			new URL(webUrl).port ||
			(new URL(webUrl).protocol === "https:" ? "443" : "80"),
		SUP_LOCAL_POSTGRES_PASSWORD: postgresPassword,
		SUP_LOCAL_POSTGRES_DB: "superset_local",
		SUP_LOCAL_POSTGRES_PORT: String(postgresPort),
		SUP_LOCAL_REDIS_PASSWORD: redisPassword,
		SUP_LOCAL_REDIS_PORT: String(redisPort),
		SUP_LOCAL_ELECTRIC_SECRET: electricSecret,
		SUP_LOCAL_ELECTRIC_PORT: String(electricPort),
		SUP_LOCAL_NEON_PROXY_PORT: String(neonProxyPort),
		SUP_LOCAL_SRH_PORT: String(srhPort),
		SUP_LOCAL_ELECTRIC_PROXY_PORT: String(electricProxyPort),
		SUP_LOCAL_ELECTRIC_DATABASE_URL: local
			? `postgresql://superset_local:${postgresPassword}@postgres:5432/superset_local?sslmode=disable`
			: databaseUrl,
	};
	return { config, environment, configFile, runtimeEnvFile };
}

function loadConfiguration(options) {
	const configFile = configPathFrom(options);
	if (!fs.existsSync(configFile))
		throw new Error(
			`${configFile} does not exist; run superset-local init first`,
		);
	const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
	if (config.schemaVersion !== CONFIG_VERSION)
		throw new Error(`unsupported config schema ${config.schemaVersion}`);
	const runtimeEnvFile = path.resolve(
		path.dirname(configFile),
		config.runtimeEnvFile,
	);
	if (!fs.existsSync(runtimeEnvFile))
		throw new Error(`${runtimeEnvFile} is missing; rerun init with --force`);
	return {
		config,
		configFile,
		runtimeEnvFile,
		environment: parseEnv(fs.readFileSync(runtimeEnvFile, "utf8")),
	};
}

function validateLoaded({ config, environment }) {
	const errors = [];
	const warnings = [];
	const policyOptions = {
		blockedHosts: config.policy?.blockedHosts,
		networkMode: config.policy?.networkMode,
		allowHosts: config.policy?.allowHosts,
	};
	if (!new Set(["local", "external"]).has(config.profile))
		errors.push(`unsupported profile ${config.profile}`);
	if (!path.isAbsolute(config.sourceRoot ?? "")) {
		errors.push("sourceRoot must be an absolute path");
	} else {
		for (const requiredFile of ["package.json", "appliance/Dockerfile"]) {
			if (!fs.existsSync(path.join(config.sourceRoot, requiredFile))) {
				errors.push(`sourceRoot is missing ${requiredFile}`);
			}
		}
		if (environment.SUP_LOCAL_SOURCE_ROOT !== config.sourceRoot) {
			errors.push("SUP_LOCAL_SOURCE_ROOT must match sourceRoot");
		}
	}
	if (
		!new Set(["default-deny", "deny-superset"]).has(config.policy?.networkMode)
	) {
		errors.push(`unsupported network mode ${config.policy?.networkMode}`);
	}
	for (const [label, value] of Object.entries(config.endpoints ?? {})) {
		try {
			assertAllowedUrl(value, { ...policyOptions, label: `${label} endpoint` });
		} catch (error) {
			errors.push(error.message);
		}
	}
	for (const label of ["api", "web"]) {
		try {
			if (
				!isLoopbackHost(
					hostFromUrl(config.endpoints?.[label], `${label} endpoint`),
				)
			) {
				errors.push(`${label} endpoint must use a loopback host`);
			}
		} catch (error) {
			errors.push(error.message);
		}
	}
	for (const [key, value] of Object.entries(environment)) {
		if (!/^(?:https?|postgres(?:ql)?|redis(?:s)?):\/\//.test(value)) continue;
		if (key.startsWith("SUP_LOCAL_CONTAINER_")) {
			try {
				assertAllowedUrl(value, {
					...policyOptions,
					label: key,
					networkMode: "deny-superset",
				});
			} catch (error) {
				errors.push(error.message);
			}
			continue;
		}
		if (
			key === "SUP_LOCAL_ELECTRIC_DATABASE_URL" &&
			config.profile === "local"
		) {
			try {
				if (hostFromUrl(value, key) !== "postgres")
					errors.push(
						`${key} must point at the private Compose postgres service`,
					);
			} catch (error) {
				errors.push(error.message);
			}
			continue;
		}
		try {
			assertAllowedUrl(value, { ...policyOptions, label: key });
		} catch (error) {
			errors.push(error.message);
		}
	}
	for (const key of [
		"SUPERSET_LOCAL_MODE",
		"SUPERSET_CLOUD_DISABLED",
		"SUPERSET_RELAY_DISABLED",
		"SUPERSET_TELEMETRY_DISABLED",
		"SUPERSET_AUTO_UPDATE_DISABLED",
		"SUPERSET_HOSTED_INTEGRATIONS_DISABLED",
	]) {
		if (environment[key] !== "true") errors.push(`${key} must be true`);
	}
	if (config.integration?.status !== "verified")
		warnings.push("upstream application gates are not marked verified");
	return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function composeArgs(loaded, action) {
	const args = [
		"compose",
		"-f",
		COMPOSE_FILE,
		"--env-file",
		loaded.runtimeEnvFile,
		"-p",
		loaded.config.composeProject,
	];
	args.push("--profile", "application");
	if (loaded.config.profile === "local") args.push("--profile", "local");
	args.push(...action);
	return args;
}

function runDocker(loaded, action) {
	const result = spawnSync("docker", composeArgs(loaded, action), {
		stdio: "inherit",
	});
	if (result.error)
		throw new Error(`could not run Docker: ${result.error.message}`);
	return result.status ?? 1;
}

async function initCommand(options) {
	await promptForMissing(options);
	const built = buildConfiguration(options);
	if (!options.force) {
		for (const file of [built.configFile, built.runtimeEnvFile]) {
			if (fs.existsSync(file))
				throw new Error(`${file} already exists; use --force to replace it`);
		}
	}
	writePrivateFile(
		built.runtimeEnvFile,
		serializeEnv(built.environment),
		options.force,
	);
	writePrivateFile(
		built.configFile,
		`${JSON.stringify(built.config, null, 2)}\n`,
		options.force,
	);
	console.log(`Created ${built.configFile}`);
	console.log(`Created private runtime environment ${built.runtimeEnvFile}`);
	console.log("Next: superset-local doctor && superset-local up");
}

function doctorCommand(options) {
	const loaded = loadConfiguration(options);
	const result = validateLoaded(loaded);
	try {
		const contract = JSON.parse(fs.readFileSync(CONTRACT_FILE, "utf8"));
		if (contract.status !== "verified")
			result.warnings.push(`runtime contract status is ${contract.status}`);
	} catch (error) {
		result.errors.push(`cannot read runtime contract: ${error.message}`);
	}
	if (loaded.config.profile === "local") {
		const docker = spawnSync("docker", ["compose", "version"], {
			encoding: "utf8",
		});
		if (docker.error || docker.status !== 0)
			result.errors.push("Docker Compose is required for the local profile");
	}
	const payload = {
		ok:
			result.errors.length === 0 &&
			(!options.strict || result.warnings.length === 0),
		...result,
	};
	if (options.json) console.log(JSON.stringify(payload, null, 2));
	else {
		for (const error of result.errors) console.log(`ERROR ${error}`);
		for (const warning of result.warnings) console.log(`WARN  ${warning}`);
		if (!result.errors.length)
			console.log(
				"OK    configuration contains no Superset-operated endpoints",
			);
	}
	if (!payload.ok) process.exitCode = 1;
}

function runCommand(options) {
	const loaded = loadConfiguration(options);
	const validation = validateLoaded(loaded);
	if (validation.errors.length) throw new Error(validation.errors.join("; "));
	const separator = options._.indexOf("--");
	const command =
		separator >= 0 ? options._.slice(separator + 1) : options._.slice(1);
	if (!command.length) throw new Error("run needs a command after --");
	const result = spawnSync(command[0], command.slice(1), {
		stdio: "inherit",
		env: {
			...process.env,
			...loaded.environment,
			SUPERSET_LOCAL_CONFIG: loaded.configFile,
		},
	});
	if (result.error)
		throw new Error(`could not run ${command[0]}: ${result.error.message}`);
	process.exitCode = result.status ?? 1;
}

export async function main(argv) {
	const options = parseArgs(argv);
	const command = options._[0];
	if (!command || options.help || command === "help") {
		console.log(usage());
		return;
	}
	if (command === "init") return initCommand(options);
	if (command === "doctor") return doctorCommand(options);
	if (command === "build") {
		process.exitCode = runDocker(loadConfiguration(options), [
			"build",
			"migrate",
		]);
		return;
	}
	if (command === "up") {
		process.exitCode = runDocker(loadConfiguration(options), [
			"up",
			"-d",
			"--wait",
		]);
		return;
	}
	if (command === "down") {
		process.exitCode = runDocker(loadConfiguration(options), ["down"]);
		return;
	}
	if (command === "status") {
		process.exitCode = runDocker(loadConfiguration(options), ["ps"]);
		return;
	}
	if (command === "run") return runCommand(options);
	if (command === "config") {
		const { config } = loadConfiguration(options);
		console.log(JSON.stringify(config, null, 2));
		return;
	}
	throw new Error(`unknown command ${command}\n\n${usage()}`);
}

export const internals = {
	parseArgs,
	validateLoaded,
	loadConfiguration,
	COMPOSE_FILE,
};
