import { describe, expect, test } from "bun:test";
import {
	getJwtExpiresAtMs,
	JWT_REFRESH_LEEWAY_MS,
} from "../src/internal/utils/jwt-expiry";

function makeJwt(payload: Record<string, unknown>): string {
	const encoded = btoa(JSON.stringify(payload))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return `header.${encoded}.signature`;
}

describe("getJwtExpiresAtMs", () => {
	test("uses the token's signed expiry for short and default lifetimes", () => {
		const now = 1_700_000_000_000;

		expect(getJwtExpiresAtMs(makeJwt({ exp: now / 1000 + 5 * 60 }), now)).toBe(
			now + 5 * 60_000,
		);
		expect(getJwtExpiresAtMs(makeJwt({ exp: now / 1000 + 60 * 60 }), now)).toBe(
			now + 60 * 60_000,
		);
		expect(JWT_REFRESH_LEEWAY_MS).toBe(60_000);
	});

	test("falls back to the shortest supported lifetime for malformed tokens", () => {
		const now = 1_700_000_000_000;

		expect(getJwtExpiresAtMs("malformed", now)).toBe(now + 5 * 60_000);
	});
});
