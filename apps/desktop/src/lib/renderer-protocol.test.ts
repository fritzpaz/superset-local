import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
	PACKAGED_RENDERER_ORIGIN,
	PACKAGED_RENDERER_URL,
	resolvePackagedRendererPath,
} from "./renderer-protocol";

describe("packaged renderer protocol", () => {
	const rendererRoot = path.resolve("/packaged/renderer");

	test("uses a stable, non-file origin for packaged requests", () => {
		expect(PACKAGED_RENDERER_ORIGIN).toBe("superset-app://renderer");
		expect(PACKAGED_RENDERER_URL).toBe("superset-app://renderer/index.html#/");
	});

	test("maps renderer assets only inside the packaged directory", () => {
		expect(
			resolvePackagedRendererPath(
				rendererRoot,
				"superset-app://renderer/assets/index.js",
			),
		).toBe(path.join(rendererRoot, "assets/index.js"));
		expect(
			resolvePackagedRendererPath(rendererRoot, "superset-app://renderer/"),
		).toBe(path.join(rendererRoot, "index.html"));
	});

	test("rejects another origin and encoded traversal", () => {
		expect(
			resolvePackagedRendererPath(
				rendererRoot,
				"superset-app://untrusted/index.html",
			),
		).toBeNull();
		expect(
			resolvePackagedRendererPath(
				rendererRoot,
				"superset-app://renderer/%2e%2e%2fsecret",
			),
		).toBeNull();
	});
});
