import { describe, expect, test } from "bun:test";
import { handler } from "./index";
import type { Env } from "./types";

const env: Env = {
	AUTH_URL: "https://app.example.test",
	ELECTRIC_ALLOWED_ORIGIN: "https://app.example.test",
	ELECTRIC_SHAPE_URL: "https://electric.example.test/v1/shape",
};
describe("Electric proxy perimeter", () => {
	test("exposes a credential-free health check", async () => {
		const response = await handler.fetch(
			new Request("https://app.example.test/_health"),
			env,
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	test("allows preflight only from the configured web origin", async () => {
		const allowed = await handler.fetch(
			new Request("https://app.example.test/v1/shape", {
				headers: { Origin: "https://app.example.test" },
				method: "OPTIONS",
			}),
			env,
		);
		const denied = await handler.fetch(
			new Request("https://app.example.test/v1/shape", {
				headers: { Origin: "https://other.example.test" },
				method: "OPTIONS",
			}),
			env,
		);

		expect(allowed.status).toBe(204);
		expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://app.example.test",
		);
		expect(denied.status).toBe(403);
		expect(denied.headers.has("Access-Control-Allow-Origin")).toBe(false);
	});

	test("does not reflect an arbitrary origin on an auth failure", async () => {
		const response = await handler.fetch(
			new Request("https://app.example.test/v1/shape", {
				headers: { Origin: "https://other.example.test" },
			}),
			env,
		);

		expect(response.status).toBe(401);
		expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
	});
});
