import { describe, expect, test } from "bun:test";
import {
	canAutoEnrollByDomain,
	getAuthSecurityPolicy,
} from "./security-policy";

describe("getAuthSecurityPolicy", () => {
	test("preserves existing defaults outside regulated mode", () => {
		const policy = getAuthSecurityPolicy(false);

		expect(policy.sessionExpiresIn).toBe(60 * 60 * 24 * 30);
		expect(policy.cookieCache.enabled).toBe(true);
		expect(policy.disablePublicSignUp).toBe(false);
		expect(policy.minimumPasswordLength).toBe(8);
		expect(policy.requireVerifiedEmailForDomainEnrollment).toBe(false);
		expect(policy.disableSessionRefresh).toBe(false);
		expect(policy.jwtExpirationTime).toBe("1h");
		expect(policy.oauthAccessTokenExpiresIn).toBe(60 * 60 * 24 * 7);
		expect(policy.apiKeyRateLimit.enabled).toBe(false);
	});

	test("uses revocation-friendly regulated defaults", () => {
		const policy = getAuthSecurityPolicy(true);

		expect(policy.sessionExpiresIn).toBe(15 * 60);
		expect(policy.sessionUpdateAge).toBe(5 * 60);
		expect(policy.cookieCache.enabled).toBe(false);
		expect(policy.disablePublicSignUp).toBe(true);
		expect(policy.minimumPasswordLength).toBe(12);
		expect(policy.requireVerifiedEmailForDomainEnrollment).toBe(true);
		expect(policy.disableSessionRefresh).toBe(true);
		expect(policy.jwtExpirationTime).toBe("5m");
		expect(policy.oauthAccessTokenExpiresIn).toBe(5 * 60);
		expect(policy.apiKeyRateLimit).toEqual({
			enabled: true,
			maxRequests: 300,
			timeWindow: 60 * 1000,
		});
	});

	test("allows only the isolated administrator bootstrap to bypass signup blocking", () => {
		const bootstrapPolicy = getAuthSecurityPolicy(true, {
			allowBootstrapSignUp: true,
		});

		expect(bootstrapPolicy.disablePublicSignUp).toBe(false);
		expect(bootstrapPolicy.requireVerifiedEmailForDomainEnrollment).toBe(true);
	});

	test("requires a verified address for domain enrollment in regulated mode", () => {
		const regulatedPolicy = getAuthSecurityPolicy(true);
		const defaultPolicy = getAuthSecurityPolicy(false);

		expect(
			canAutoEnrollByDomain({
				emailVerified: false,
				policy: regulatedPolicy,
			}),
		).toBe(false);
		expect(
			canAutoEnrollByDomain({
				emailVerified: true,
				policy: regulatedPolicy,
			}),
		).toBe(true);
		expect(
			canAutoEnrollByDomain({
				emailVerified: false,
				policy: defaultPolicy,
			}),
		).toBe(true);
	});
});
