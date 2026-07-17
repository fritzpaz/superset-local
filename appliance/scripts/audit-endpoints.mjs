#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const SOURCE_ROOTS = ["apps", "packages", "plugins"];
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const ALLOW_MARKER = "superset-local: allow-reference";
const DOMAIN_PATTERN = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*superset\.sh\b/gi;
const SKIPPED_DIRECTORIES = new Set(["dist", "node_modules", "release", ".turbo"]);

function walk(directory, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(target, files);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(target);
  }
}

const files = [];
for (const root of SOURCE_ROOTS) walk(path.resolve(root), files);
const findings = [];
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) return;
    const matches = line.match(DOMAIN_PATTERN);
    if (matches) findings.push({ file: path.relative(process.cwd(), file), line: index + 1, hosts: [...new Set(matches)] });
  });
}

if (!files.length) {
  console.log("WARN  no upstream application source found under apps/, packages/, or plugins/");
  process.exit(0);
}
if (findings.length) {
  for (const finding of findings) console.log(`${finding.file}:${finding.line}: ${finding.hosts.join(", ")}`);
  console.error(`Found ${findings.length} unreviewed Superset endpoint reference(s).`);
  process.exit(1);
}
console.log(`OK    scanned ${files.length} source files with no unreviewed Superset endpoint references`);
