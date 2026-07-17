import { describe, expect, test } from "bun:test";
import {
	assertNotSupersetOperatedUrl,
	isSupersetOperatedHostname,
	localFeatureDisabled,
	validateSupersetLocalEnvironment,
} from "./local-runtime";

describe("Superset Local runtime policy", () => {
	test("blocks the Superset apex and every subdomain", () => {
		expect(isSupersetOperatedHostname("superset.sh")).toBe(true);
		expect(isSupersetOperatedHostname("relay.backup.superset.sh.")).toBe(true);
		expect(() =>
			assertNotSupersetOperatedUrl("https://api.superset.sh/v1", "API"),
		).toThrow("Superset-operated endpoint");
	});

	test("allows operator-controlled and loopback endpoints", () => {
		expect(() =>
			validateSupersetLocalEnvironment({
				SUPERSET_LOCAL_MODE: "true",
				NEXT_PUBLIC_API_URL: "http://127.0.0.1:3001",
				NEXT_PUBLIC_WEB_URL: "http://localhost:3000",
				NEXT_PUBLIC_ELECTRIC_URL: "https://electric.internal.example",
				DATABASE_URL: "postgresql://db.internal.example/superset",
			}),
		).not.toThrow();
	});

	test("fails closed when a required endpoint is absent", () => {
		expect(() =>
			validateSupersetLocalEnvironment({ SUPERSET_LOCAL_MODE: "true" }),
		).toThrow("NEXT_PUBLIC_API_URL is required");
	});

	test("local mode disables hosted features regardless of individual flags", () => {
		expect(
			localFeatureDisabled({ SUPERSET_LOCAL_MODE: "true" }, "TELEMETRY"),
		).toBe(true);
	});
});
