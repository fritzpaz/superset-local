import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CLI = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"bin",
	"superset-local.js",
);

test("non-interactive init creates private files and refuses accidental replacement", () => {
	const directory = fs.mkdtempSync(
		path.join(os.tmpdir(), "superset-local-cli-"),
	);
	const config = path.join(directory, "superset-local.json");
	const args = [
		CLI,
		"init",
		"--profile",
		"local",
		"--non-interactive",
		"--config",
		config,
	];
	const first = spawnSync(process.execPath, args, { encoding: "utf8" });
	assert.equal(first.status, 0, first.stderr);
	assert.equal(fs.statSync(config).mode & 0o777, 0o600);
	assert.equal(
		fs.statSync(path.join(directory, ".superset-local", "runtime.env")).mode &
			0o777,
		0o600,
	);

	const originalRuntime = fs.readFileSync(
		path.join(directory, ".superset-local", "runtime.env"),
		"utf8",
	);
	const second = spawnSync(process.execPath, args, { encoding: "utf8" });
	assert.equal(second.status, 1);
	assert.match(second.stderr, /already exists/);
	assert.equal(
		fs.readFileSync(
			path.join(directory, ".superset-local", "runtime.env"),
			"utf8",
		),
		originalRuntime,
	);
});

test("external config output does not disclose infrastructure URLs", () => {
	const directory = fs.mkdtempSync(
		path.join(os.tmpdir(), "superset-local-cli-"),
	);
	const config = path.join(directory, "superset-local.json");
	const initialized = spawnSync(
		process.execPath,
		[
			CLI,
			"init",
			"--profile",
			"external",
			"--non-interactive",
			"--config",
			config,
			"--database-url",
			"postgresql://user:db-password-123@db.corp.test/app",
			"--redis-url",
			"rediss://:cache-password-456@cache.corp.test/0",
			"--electric-url",
			"https://token:electric-password-789@electric.corp.test",
		],
		{ encoding: "utf8" },
	);
	assert.equal(initialized.status, 0, initialized.stderr);

	const printed = spawnSync(
		process.execPath,
		[CLI, "config", "--config", config],
		{ encoding: "utf8" },
	);
	assert.equal(printed.status, 0, printed.stderr);
	assert.doesNotMatch(
		printed.stdout,
		/db-password-123|cache-password-456|electric-password-789|token:|postgresql:|rediss:/,
	);
	assert.match(printed.stdout, /db\.corp\.test/);
});
