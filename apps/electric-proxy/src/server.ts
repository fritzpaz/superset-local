import { handler } from "./index";
import type { Env } from "./types";

const port = Number(process.env.PORT ?? "8787");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error("PORT must be an integer from 1 to 65535");
}

const env: Env = {
	AUTH_URL: process.env.AUTH_URL ?? "",
	ELECTRIC_ALLOWED_ORIGIN: process.env.ELECTRIC_ALLOWED_ORIGIN,
	ELECTRIC_SECRET: process.env.ELECTRIC_SECRET,
	ELECTRIC_SHAPE_URL: process.env.ELECTRIC_SHAPE_URL,
	ELECTRIC_SOURCE_ID: process.env.ELECTRIC_SOURCE_ID,
	ELECTRIC_SOURCE_SECRET: process.env.ELECTRIC_SOURCE_SECRET,
};

if (!env.AUTH_URL || !env.ELECTRIC_SHAPE_URL || !env.ELECTRIC_ALLOWED_ORIGIN) {
	throw new Error(
		"AUTH_URL, ELECTRIC_SHAPE_URL, and ELECTRIC_ALLOWED_ORIGIN are required",
	);
}

Bun.serve({
	fetch: (request) => handler.fetch(request, env),
	hostname: "0.0.0.0",
	port,
});
