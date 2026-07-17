import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const AUDIT_SCRIPT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"scripts",
	"audit-endpoints.mjs",
);
const REPOSITORY_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);

function fixture(source) {
	const directory = fs.mkdtempSync(
		path.join(os.tmpdir(), "superset-local-audit-"),
	);
	fs.mkdirSync(path.join(directory, "apps"));
	fs.writeFileSync(path.join(directory, "apps", "request.ts"), source);
	return directory;
}

test("source audit fails on an unreviewed Superset endpoint", () => {
	const result = spawnSync(process.execPath, [AUDIT_SCRIPT], {
		cwd: fixture('fetch("https://api.superset.sh/v1");\n'),
		encoding: "utf8",
	});
	assert.equal(result.status, 1);
	assert.match(result.stdout, /apps\/request\.ts:1/);
	assert.match(result.stderr, /unreviewed Superset endpoint/);
});

test("source audit permits an explicitly reviewed metadata reference", () => {
	const source =
		'const upstream = "https://superset.sh"; // superset-local: allow-reference documentation link\n';
	const result = spawnSync(process.execPath, [AUDIT_SCRIPT], {
		cwd: fixture(source),
		encoding: "utf8",
	});
	assert.equal(result.status, 0);
	assert.match(result.stdout, /no unreviewed Superset endpoint references/);
});

test("desktop renderer receives the local-mode build flag", () => {
	const source = fs.readFileSync(
		path.join(REPOSITORY_ROOT, "apps", "desktop", "electron.vite.config.ts"),
		"utf8",
	);
	const rendererStart = source.indexOf("\n\trenderer: {");
	const rendererServer = source.indexOf("\n\t\tserver:", rendererStart);
	assert.notEqual(rendererStart, -1);
	assert.notEqual(rendererServer, -1);
	assert.match(
		source.slice(rendererStart, rendererServer),
		/"process\.env\.SUPERSET_LOCAL_MODE": defineEnv/,
	);
});
