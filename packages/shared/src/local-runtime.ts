const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const SUPERSET_HOST_SUFFIX = "superset.sh";

export type RuntimeEnvironment = Record<string, unknown>;

export function isEnabled(value: unknown): boolean {
	return (
		typeof value === "string" && TRUE_VALUES.has(value.trim().toLowerCase())
	);
}

export function isSupersetLocalMode(environment: RuntimeEnvironment): boolean {
	return isEnabled(environment.SUPERSET_LOCAL_MODE);
}

export function isSupersetOperatedHostname(hostname: string): boolean {
	const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
	return (
		normalized === SUPERSET_HOST_SUFFIX ||
		normalized.endsWith(`.${SUPERSET_HOST_SUFFIX}`)
	);
}

export function assertNotSupersetOperatedUrl(
	value: string,
	label: string,
): void {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${label} must be an absolute URL`);
	}
	if (isSupersetOperatedHostname(url.hostname)) {
		throw new Error(
			`${label} cannot use Superset-operated endpoint ${url.hostname} in local mode`,
		);
	}
}

const LOCAL_ENDPOINTS = [
	"NEXT_PUBLIC_API_URL",
	"NEXT_PUBLIC_WEB_URL",
	"NEXT_PUBLIC_ELECTRIC_URL",
] as const;

export function validateSupersetLocalEnvironment(
	environment: RuntimeEnvironment,
): void {
	if (!isSupersetLocalMode(environment)) return;

	for (const key of LOCAL_ENDPOINTS) {
		const value = environment[key];
		if (typeof value !== "string" || !value) {
			throw new Error(`${key} is required in Superset Local mode`);
		}
		assertNotSupersetOperatedUrl(value, key);
	}

	for (const [key, value] of Object.entries(environment)) {
		if (typeof value !== "string" || !value || !/(?:URL|HOST)$/.test(key)) {
			continue;
		}
		if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) continue;
		assertNotSupersetOperatedUrl(value, key);
	}
}

export function localFeatureDisabled(
	environment: RuntimeEnvironment,
	feature: "CLOUD" | "RELAY" | "TELEMETRY" | "AUTO_UPDATE",
): boolean {
	return (
		isSupersetLocalMode(environment) ||
		isEnabled(environment[`SUPERSET_${feature}_DISABLED`])
	);
}
