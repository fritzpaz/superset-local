import { describe, expect, test } from "bun:test";
import { decodeJwtExpiresAtMs } from "./jwt-expiry";

function makeJwt(payload: Record<string, unknown>): string {
	return `header.${btoa(JSON.stringify(payload))}.signature`;
}

describe("decodeJwtExpiresAtMs", () => {
	test("reads a numeric expiry", () => {
		expect(decodeJwtExpiresAtMs(makeJwt({ exp: 1_800_000_000 }))).toBe(
			1_800_000_000_000,
		);
	});

	test("rejects missing or malformed expiry data", () => {
		expect(decodeJwtExpiresAtMs(makeJwt({ sub: "user-1" }))).toBeNull();
		expect(decodeJwtExpiresAtMs("not-a-jwt")).toBeNull();
		expect(decodeJwtExpiresAtMs("a.%%%.c")).toBeNull();
	});
});
