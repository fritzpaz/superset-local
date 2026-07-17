import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import { config as dotenvConfig } from "dotenv";
import type { NextConfig } from "next";

if (process.env.NODE_ENV !== "production") {
	dotenvConfig({
		path: join(process.cwd(), "../../.env"),
		override: true,
		quiet: true,
	});
}

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					...(process.env.NODE_ENV === "production"
						? [
								{
									key: "Strict-Transport-Security",
									value: "max-age=31536000; includeSubDomains",
								},
							]
						: []),
					{
						key: "Permissions-Policy",
						value: "camera=(), geolocation=(), microphone=()",
					},
					{ key: "Referrer-Policy", value: "no-referrer" },
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "X-Frame-Options", value: "DENY" },
				],
			},
		];
	},

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.public.blob.vercel-storage.com",
			},
		],
	},
};

export default process.env.SUPERSET_LOCAL_MODE === "true"
	? config
	: withSentryConfig(config, {
			org: "superset-sh",
			project: "api",
			silent: !process.env.CI,
			authToken: process.env.SENTRY_AUTH_TOKEN,
			widenClientFileUpload: true,
			tunnelRoute: "/monitoring",
			disableLogger: true,
			automaticVercelMonitors: true,
		});
