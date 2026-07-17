import { describe, expect, test } from "bun:test";
import {
	APPLICATION_SECRET_KEYS,
	CONTAINER_SECRET_KEYS,
} from "./container-secrets";

describe("ECS container secret boundaries", () => {
	test("the public Electric proxy receives only its upstream credential", () => {
		expect(CONTAINER_SECRET_KEYS["electric-proxy"]).toEqual([
			"ELECTRIC_SECRET",
		]);
	});

	test("web receives session and database secrets, not API-only secrets", () => {
		expect(CONTAINER_SECRET_KEYS.web).toContain("BETTER_AUTH_SECRET");
		expect(CONTAINER_SECRET_KEYS.web).toContain("DATABASE_URL");
		expect(CONTAINER_SECRET_KEYS.web).not.toContain("ELECTRIC_SECRET");
		expect(CONTAINER_SECRET_KEYS.web).not.toContain("KV_URL");
		expect(CONTAINER_SECRET_KEYS.web).not.toContain("SECRETS_ENCRYPTION_KEY");
	});

	test("API receives API credentials but not the Electric credential", () => {
		expect(CONTAINER_SECRET_KEYS.api).toContain("SECRETS_ENCRYPTION_KEY");
		expect(CONTAINER_SECRET_KEYS.api).toContain("KV_URL");
		expect(CONTAINER_SECRET_KEYS.api).not.toContain("ELECTRIC_SECRET");
	});

	test("all configured keys come from the generated application secret", () => {
		const available = new Set<string>(APPLICATION_SECRET_KEYS);
		for (const keys of Object.values(CONTAINER_SECRET_KEYS)) {
			for (const key of keys) expect(available.has(key)).toBe(true);
		}
	});
});
