import { describe, expect, test } from "bun:test";
import { assertDigestImage } from "./config";

describe("AWS deployment configuration", () => {
	test("accepts an immutable image", () => {
		expect(() =>
			assertDigestImage(
				"appImage",
				"111122223333.dkr.ecr.us-east-1.amazonaws.com/app@sha256:abc",
			),
		).not.toThrow();
	});

	test("rejects mutable tags by default", () => {
		expect(() => assertDigestImage("appImage", "example/app:latest")).toThrow(
			"immutable image reference",
		);
	});
});
