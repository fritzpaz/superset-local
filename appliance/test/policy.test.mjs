import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	buildConfiguration,
	internals,
	parseEnv,
	serializeEnv,
} from "../src/cli.mjs";
import {
	assertAllowedUrl,
	isBlockedHost,
	isLoopbackHost,
} from "../src/policy.mjs";

const REPOSITORY_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);

test("blocks Superset hosts and every subdomain", () => {
	assert.equal(isBlockedHost("superset.sh"), true);
	assert.equal(isBlockedHost("nested.relay.superset.sh"), true);
	assert.throws(
		() => assertAllowedUrl("https://api.superset.sh/v1"),
		/blocked Superset-operated host/,
	);
	assert.throws(
		() => assertAllowedUrl("https://api.superset.sh/v1", { blockedHosts: [] }),
		/blocked Superset-operated host/,
	);
});

test("recognizes only loopback names and addresses", () => {
	for (const host of ["localhost", "127.0.0.1", "127.99.2.3", "::1"])
		assert.equal(isLoopbackHost(host), true);
	for (const host of ["0.0.0.0", "192.168.1.2", "example.test"])
		assert.equal(isLoopbackHost(host), false);
});

test("default-deny permits loopback and explicit infrastructure", () => {
	assert.doesNotThrow(() =>
		assertAllowedUrl("http://127.0.0.1:3000", { networkMode: "default-deny" }),
	);
	assert.doesNotThrow(() =>
		assertAllowedUrl("postgresql://db.internal/app", {
			networkMode: "default-deny",
			allowHosts: ["db.internal"],
		}),
	);
	assert.throws(
		() =>
			assertAllowedUrl("https://example.com", { networkMode: "default-deny" }),
		/non-allowlisted/,
	);
});

test("local initialization emits private, local-only service URLs", () => {
	const directory = fs.mkdtempSync(
		path.join(os.tmpdir(), "superset-local-test-"),
	);
	const configFile = path.join(directory, "superset-local.json");
	const built = buildConfiguration(
		{
			profile: "local",
			"allow-host": [],
			"source-root": REPOSITORY_ROOT,
		},
		configFile,
	);
	assert.equal(built.config.profile, "local");
	assert.match(built.environment.DATABASE_URL, /@127\.0\.0\.1:5432/);
	assert.equal(built.environment.SUPERSET_RELAY_DISABLED, "true");
	assert.equal(built.environment.SUPERSET_HOSTED_INTEGRATIONS_DISABLED, "true");
	assert.equal(
		built.environment.NEXT_PUBLIC_ELECTRIC_URL,
		"http://127.0.0.1:8787",
	);
	assert.ok(built.environment.SUP_LOCAL_IMAGE_TAG);
	assert.equal(built.config.sourceRoot, REPOSITORY_ROOT);
	assert.equal(built.environment.SUP_LOCAL_SOURCE_ROOT, REPOSITORY_ROOT);
	assert.equal(built.config.policy.networkMode, "default-deny");
	assert.deepEqual(internals.validateLoaded(built).errors, []);
});

test("local initialization applies custom loopback ports", () => {
	const built = buildConfiguration(
		{
			profile: "local",
			"allow-host": [],
			"postgres-port": "15432",
			"redis-port": "16379",
			"electric-port": "13100",
			"neon-proxy-port": "14444",
		},
		"/tmp/superset-local.json",
	);
	assert.equal(built.config.localPorts.postgres, 15432);
	assert.match(built.environment.DATABASE_URL, /:15432\//);
	assert.equal(built.environment.SUP_LOCAL_ELECTRIC_PORT, "13100");
	assert.throws(
		() =>
			buildConfiguration({
				profile: "local",
				"allow-host": [],
				"postgres-port": "70000",
			}),
		/must be a port/,
	);
});

test("external initialization allowlists supplied infrastructure and rejects Superset", () => {
	const base = {
		profile: "external",
		"allow-host": [],
		"database-url": "postgresql://db.corp.test/app",
		"redis-url": "rediss://cache.corp.test/0",
		"electric-url": "https://electric.corp.test",
	};
	const built = buildConfiguration(base, "/tmp/superset-local.json");
	assert.deepEqual(built.config.policy.allowHosts, [
		"cache.corp.test",
		"db.corp.test",
		"electric.corp.test",
	]);
	assert.throws(
		() =>
			buildConfiguration({
				...base,
				"electric-url": "https://relay.superset.sh",
			}),
		/blocked/,
	);
	assert.equal("electric" in built.config.endpoints, false);
	assert.equal(JSON.stringify(built.config).includes("postgresql://"), false);
});

test("external initialization allowlists a distinct unpooled database host", () => {
	const built = buildConfiguration(
		{
			profile: "external",
			"allow-host": [],
			"database-url": "postgresql://pool.db.corp.test/app",
			"database-url-unpooled": "postgresql://direct.db.corp.test/app",
			"redis-url": "rediss://cache.corp.test/0",
			"electric-url": "https://electric.corp.test",
		},
		"/tmp/superset-local.json",
	);
	assert.ok(built.config.policy.allowHosts.includes("direct.db.corp.test"));
});

test("runtime env serialization round trips special characters", () => {
	const values = { SIMPLE: "true", SECRET: 'spaces # quotes " and $dollars' };
	assert.deepEqual(parseEnv(serializeEnv(values)), values);
});

test("doctor validation rejects a tampered non-loopback app endpoint", () => {
	const built = buildConfiguration(
		{ profile: "local", "allow-host": [] },
		"/tmp/superset-local.json",
	);
	built.config.endpoints.api = "https://api.corp.test";
	built.config.policy.allowHosts.push("api.corp.test");
	assert.match(
		internals.validateLoaded(built).errors.join(" "),
		/api endpoint must use a loopback host/,
	);
});
