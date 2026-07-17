import net from "node:net";

export const DEFAULT_BLOCKED_HOSTS = Object.freeze([
	"superset.sh",
	"www.superset.sh",
	"api.superset.sh",
	"app.superset.sh",
	"relay.superset.sh",
	"docs.superset.sh",
]);

export function normalizeHost(host) {
	return host
		.trim()
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "");
}

export function isLoopbackHost(host) {
	const normalized = normalizeHost(host);
	if (normalized === "localhost" || normalized === "::1") return true;
	return net.isIP(normalized) === 4 && normalized.startsWith("127.");
}

export function isBlockedHost(host, blockedHosts = DEFAULT_BLOCKED_HOSTS) {
	const normalized = normalizeHost(host);
	return blockedHosts.some((blocked) => {
		const suffix = normalizeHost(blocked);
		return normalized === suffix || normalized.endsWith(`.${suffix}`);
	});
}

export function hostFromUrl(value, label = "URL") {
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${label} must be an absolute URL`);
	}
	if (!parsed.hostname) throw new Error(`${label} must include a hostname`);
	return normalizeHost(parsed.hostname);
}

export function assertAllowedUrl(value, options = {}) {
	const {
		label = "URL",
		blockedHosts = DEFAULT_BLOCKED_HOSTS,
		networkMode = "deny-superset",
		allowHosts = [],
	} = options;
	const host = hostFromUrl(value, label);

	const mandatoryBlockedHosts = [
		...new Set([...DEFAULT_BLOCKED_HOSTS, ...blockedHosts]),
	];
	if (isBlockedHost(host, mandatoryBlockedHosts)) {
		throw new Error(
			`${label} points at blocked Superset-operated host ${host}`,
		);
	}

	if (networkMode === "default-deny") {
		const normalizedAllowHosts = allowHosts.map(normalizeHost);
		const allowed =
			isLoopbackHost(host) ||
			normalizedAllowHosts.some(
				(allowedHost) =>
					host === allowedHost || host.endsWith(`.${allowedHost}`),
			);
		if (!allowed)
			throw new Error(`${label} points at non-allowlisted host ${host}`);
	}

	return value;
}

export function createEndpointPolicy(config) {
	const policy = config.policy ?? {};
	return {
		assert(value, label) {
			return assertAllowedUrl(value, {
				label,
				blockedHosts: policy.blockedHosts,
				networkMode: policy.networkMode,
				allowHosts: policy.allowHosts,
			});
		},
		async fetch(value, init) {
			const target =
				typeof Request !== "undefined" && value instanceof Request
					? value.url
					: String(value);
			assertAllowedUrl(target, {
				label: "outbound request",
				blockedHosts: policy.blockedHosts,
				networkMode: policy.networkMode,
				allowHosts: policy.allowHosts,
			});
			return fetch(value, init);
		},
	};
}
