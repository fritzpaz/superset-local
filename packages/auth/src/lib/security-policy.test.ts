import { describe, expect, test } from "bun:test";
import { getAuthSecurityPolicy } from "./security-policy";

describe("getAuthSecurityPolicy", () => {
	test("preserves existing defaults outside regulated mode", () => {
		const policy = getAuthSecurityPolicy(false);

		expect(policy.sessionExpiresIn).toBe(60 * 60 * 24 * 30);
		expect(policy.cookieCache.enabled).toBe(true);
		expect(policy.minimumPasswordLength).toBe(8);
		expect(policy.apiKeyRateLimit.enabled).toBe(false);
	});

	test("uses revocation-friendly regulated defaults", () => {
		const policy = getAuthSecurityPolicy(true);

		expect(policy.sessionExpiresIn).toBe(15 * 60);
		expect(policy.sessionUpdateAge).toBe(5 * 60);
		expect(policy.cookieCache.enabled).toBe(false);
		expect(policy.minimumPasswordLength).toBe(12);
		expect(policy.apiKeyRateLimit).toEqual({
			enabled: true,
			maxRequests: 300,
			timeWindow: 60 * 1000,
		});
	});
});
