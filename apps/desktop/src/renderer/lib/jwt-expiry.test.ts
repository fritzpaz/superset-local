import { describe, expect, it } from "bun:test";
import { decodeJwtExpiresAtMs, getJwtRefreshDelayMs } from "./jwt-expiry";

function makeJwt(payload: object): string {
	const encode = (obj: object) =>
		btoa(JSON.stringify(obj))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
	return `${encode({ alg: "EdDSA" })}.${encode(payload)}.sig`;
}

describe("decodeJwtExpiresAtMs", () => {
	it("returns exp in epoch milliseconds", () => {
		expect(decodeJwtExpiresAtMs(makeJwt({ exp: 1_800_000_000 }))).toBe(
			1_800_000_000_000,
		);
	});

	it("returns null when exp is missing", () => {
		expect(decodeJwtExpiresAtMs(makeJwt({ sub: "u1" }))).toBeNull();
	});

	it("returns null for malformed tokens", () => {
		expect(decodeJwtExpiresAtMs("not-a-jwt")).toBeNull();
		expect(decodeJwtExpiresAtMs("a.%%%.c")).toBeNull();
	});
});

describe("getJwtRefreshDelayMs", () => {
	it("refreshes one minute before the token's actual expiry", () => {
		const now = 1_700_000_000_000;
		const token = makeJwt({ exp: now / 1000 + 5 * 60 });

		expect(getJwtRefreshDelayMs(token, now, 50 * 60_000)).toBe(4 * 60_000);
	});

	it("uses a bounded minimum delay and a fallback for malformed tokens", () => {
		const now = 1_700_000_000_000;
		const nearlyExpired = makeJwt({ exp: now / 1000 + 10 });

		expect(getJwtRefreshDelayMs(nearlyExpired, now, 50 * 60_000)).toBe(30_000);
		expect(getJwtRefreshDelayMs("invalid", now, 50 * 60_000)).toBe(50 * 60_000);
	});
});
