#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SOURCE_ROOTS = [
	"apps/api/src",
	"apps/desktop/electron.vite.config.ts",
	"apps/desktop/src",
	"apps/desktop/vite",
	"apps/web/next.config.ts",
	"apps/web/src",
	"packages/auth/src",
	"packages/cli/src",
	"packages/sdk/src",
	"packages/shared/src",
	"packages/trpc/src",
	"packages/workspace-client/src",
];
const SOURCE_EXTENSIONS = new Set([
	".cjs",
	".js",
	".jsx",
	".mjs",
	".mts",
	".ts",
	".tsx",
]);
const ALLOW_MARKER = "superset-local: allow-reference";
const DOMAIN_PATTERN = /(?:https?|wss?):\/\/(?:[a-z0-9-]+\.)*superset\.sh\b/gi;
const SKIPPED_DIRECTORIES = new Set([
	"dist",
	"node_modules",
	"release",
	".next",
	".turbo",
]);
const scriptRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const baselineFile = path.join(
	scriptRoot,
	"appliance",
	"integration",
	"endpoint-baseline.json",
);
const requestedRoot = process.argv.indexOf("--root");
const candidateRoot =
	requestedRoot >= 0 ? process.argv[requestedRoot + 1] : process.cwd();
const scanRoot = ["apps", "packages", "plugins"].some((root) =>
	fs.existsSync(path.resolve(candidateRoot, root)),
)
	? path.resolve(candidateRoot)
	: scriptRoot;
const activeRoots =
	scanRoot === scriptRoot ? SOURCE_ROOTS : ["apps", "packages", "plugins"];

function walk(directory, files) {
	if (!fs.existsSync(directory)) return;
	if (fs.statSync(directory).isFile()) {
		files.push(directory);
		return;
	}
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const target = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(target, files);
		} else if (
			SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
			!/\.(?:bench|stories|test)\.[cm]?[jt]sx?$/.test(entry.name)
		)
			files.push(target);
	}
}

function fingerprint(finding) {
	return crypto
		.createHash("sha256")
		.update(
			`${finding.file}\0${finding.source.trim()}\0${finding.hosts.join(",")}`,
		)
		.digest("hex");
}

const files = [];
for (const root of activeRoots) walk(path.resolve(scanRoot, root), files);
const findings = [];
for (const file of files) {
	const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
	lines.forEach((line, index) => {
		if (line.includes(ALLOW_MARKER)) return;
		const matches = line.match(DOMAIN_PATTERN);
		if (matches)
			findings.push({
				file: path.relative(scanRoot, file),
				line: index + 1,
				hosts: [...new Set(matches)].sort(),
				source: line,
			});
	});
}

if (process.argv.includes("--write-baseline")) {
	if (scanRoot !== scriptRoot)
		throw new Error(
			"the endpoint baseline can only be written for the repository root",
		);
	const baseline = findings.map((finding) => ({
		file: finding.file,
		fingerprint: fingerprint(finding),
		hosts: finding.hosts,
	}));
	fs.writeFileSync(
		baselineFile,
		`${JSON.stringify({ version: 1, findings: baseline }, null, 2)}\n`,
	);
	console.log(
		`Wrote ${baseline.length} reviewed endpoint reference(s) to ${path.relative(scanRoot, baselineFile)}`,
	);
	process.exit(0);
}

const reviewed =
	scanRoot === scriptRoot && fs.existsSync(baselineFile)
		? new Set(
				JSON.parse(fs.readFileSync(baselineFile, "utf8")).findings.map(
					(finding) => finding.fingerprint,
				),
			)
		: new Set();
const unreviewed = findings.filter(
	(finding) => !reviewed.has(fingerprint(finding)),
);

if (!files.length) {
	console.log(
		"WARN  no upstream application source found under apps/, packages/, or plugins/",
	);
	process.exit(0);
}
if (unreviewed.length) {
	for (const finding of unreviewed)
		console.log(`${finding.file}:${finding.line}: ${finding.hosts.join(", ")}`);
	console.error(
		`Found ${unreviewed.length} unreviewed Superset endpoint reference(s).`,
	);
	process.exit(1);
}
console.log(
	`OK    scanned ${files.length} source files; ${findings.length} reviewed reference(s), no unreviewed Superset endpoint references`,
);
