import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import { config as dotenvConfig } from "dotenv";
import type { NextConfig } from "next";

// Load .env from monorepo root during development
if (process.env.NODE_ENV !== "production") {
	dotenvConfig({
		path: join(process.cwd(), "../../.env"),
		override: true,
		quiet: true,
	});
}

const isProduction = process.env.NODE_ENV === "production";
const isLocal = process.env.SUPERSET_LOCAL_MODE === "true";
const isHipaaMode = process.env.SUPERSET_HIPAA_MODE === "true";
const apiOrigin = process.env.NEXT_PUBLIC_API_URL
	? new URL(process.env.NEXT_PUBLIC_API_URL).origin
	: null;
// The web app reaches host-services through the relay — a WebSocket for the
// terminal stream and HTTP for host tRPC. In dev the blanket `ws:`/`wss:`
// below covers the socket; prod needs the relay origins listed explicitly so
// `connect-src` blocks neither. The hard-coded prod fallback keeps the header
// correct even if RELAY_URL isn't plumbed into the build env.
const relayWsOrigin = process.env.RELAY_URL
	? new URL(process.env.RELAY_URL).origin.replace(/^http/, "ws")
	: isProduction && !isLocal
		? "wss://relay.superset.sh"
		: null;
const relayHttpOrigin = process.env.RELAY_URL
	? new URL(process.env.RELAY_URL).origin
	: isProduction && !isLocal
		? "https://relay.superset.sh"
		: null;

const contentSecurityPolicy = [
	"default-src 'self'",
	"base-uri 'self'",
	[
		"connect-src 'self'",
		apiOrigin,
		relayWsOrigin,
		relayHttpOrigin,
		!isLocal && "wss://relay-backup.superset.sh",
		!isLocal && "https://relay-backup.superset.sh",
		!isLocal && "https://*.ingest.sentry.io",
		!isLocal && "https://*.sentry.io",
		!isLocal && "https://us.i.posthog.com",
		!isLocal && "https://us-assets.i.posthog.com",
		!isLocal && "https://us.posthog.com",
		!isProduction && "ws:",
		!isProduction && "wss:",
	]
		.filter(Boolean)
		.join(" "),
	["font-src 'self' data:", !isHipaaMode && "https://fonts.gstatic.com"]
		.filter(Boolean)
		.join(" "),
	"form-action 'self'",
	"frame-ancestors 'none'",
	["img-src 'self' data: blob:", !isHipaaMode && "https:"]
		.filter(Boolean)
		.join(" "),
	"object-src 'none'",
	["script-src 'self' 'unsafe-inline'", !isProduction && "'unsafe-eval'"]
		.filter(Boolean)
		.join(" "),
	[
		"style-src 'self' 'unsafe-inline'",
		!isHipaaMode && "https://fonts.googleapis.com",
	]
		.filter(Boolean)
		.join(" "),
	"worker-src 'self' blob:",
].join("; ");

const securityHeaders: Array<{ key: string; value: string }> = [
	...(isProduction
		? [
				{
					key: "Strict-Transport-Security",
					value: "max-age=31536000; includeSubDomains",
				},
			]
		: []),
	{
		key: "Content-Security-Policy",
		value: contentSecurityPolicy,
	},
	{
		key: "Permissions-Policy",
		value: "camera=(), geolocation=(), microphone=()",
	},
	{
		key: "Referrer-Policy",
		value: "strict-origin-when-cross-origin",
	},
	{
		key: "X-Content-Type-Options",
		value: "nosniff",
	},
	{
		key: "X-Frame-Options",
		value: "DENY",
	},
];

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.public.blob.vercel-storage.com",
			},
		],
	},

	async rewrites() {
		if (isLocal) return [];
		return [
			{
				source: "/ingest/static/:path*",
				destination: "https://us-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/ingest/:path*",
				destination: "https://us.i.posthog.com/:path*",
			},
			{
				source: "/ingest/decide",
				destination: "https://us.i.posthog.com/decide",
			},
		];
	},

	async headers() {
		return [
			{
				source: "/(.*)",
				headers: securityHeaders,
			},
		];
	},

	skipTrailingSlashRedirect: true,
};

export default isLocal
	? config
	: withSentryConfig(config, {
			org: "superset-sh",
			project: "web",
			silent: !process.env.CI,
			authToken: process.env.SENTRY_AUTH_TOKEN,
			widenClientFileUpload: true,
			tunnelRoute: "/monitoring",
			disableLogger: true,
			automaticVercelMonitors: true,
		});
