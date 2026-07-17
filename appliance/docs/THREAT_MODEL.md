# Threat model and regulated environments

Superset Local is a technical component, not a compliance certification. A local build can be
part of a HIPAA-regulated environment only when the operator implements the required
administrative, physical, and technical safeguards and completes its own risk analysis.

## Security objective

No Superset-operated service should create, receive, maintain, or transmit operator data. The
build must also avoid automatic telemetry, diagnostics upload, Relay traffic, cloud identity,
and update requests.

## In scope

- Electron, web, API, CLI, SDK, MCP, updater, and helper-process network behavior;
- local database, cache, Electric replication, logs, terminal history, screenshots, and backups;
- child agent processes and their inherited environment;
- Git, GitHub CLI, package managers, browsers, editor integrations, and model providers;
- diagnostics, crash reports, DNS queries, and denied egress attempts.

## Not solved by this appliance

- OS account isolation, full-disk encryption, EDR/MDM, patching, or physical security;
- access control and audit policy for source repositories or external infrastructure;
- sandboxing agents away from home directories, SSH keys, browser tokens, or other repositories;
- provider BAAs, retention/deletion terms, subprocessor review, or incident response;
- de-identification of fixtures, logs, screenshots, prompts, or source material;
- vulnerabilities in upstream Superset or third-party dependencies.

Git worktrees are concurrency tools, not security boundaries.

## Data policy

The safest development policy is to keep PHI out of the software-development environment. Use
synthetic or properly de-identified data. Do not copy patient names, identifiers, dates, report
text, DICOM metadata, production screenshots, credentials, or production logs into prompts,
terminal output, fixtures, filenames, commits, issue trackers, or diagnostics.

If ePHI is permitted, every system that may receive it—including model providers, Git hosting,
cloud infrastructure, logging, crash reporting, artifact storage, and support workflows—must be
included in the operator's business-associate and security analysis.

## Primary threats and controls

| Threat | Appliance control | Required operator control |
| --- | --- | --- |
| Hard-coded Superset endpoint | Source audit and guarded endpoint policy | Default-deny egress and traffic capture |
| Hosted fallback after local failure | No generated hosted default; fail-closed integration contract | Negative/failure-path testing |
| Secret committed to Git | Private ignored runtime file | Secret scanning and managed secrets |
| PHI in terminal/log/diagnostic | Diagnostics upload disabled | Data policy, local log controls, redaction |
| Agent reads unrelated host data | None | Container/VM sandbox, least privilege, separate credentials |
| External provider receives ePHI | Explicit allowlist only | BAA, provider settings, retention and access review |
| Supply-chain/update request | Auto-update disabled | Internal mirrors, signatures, SBOM, vulnerability management |
| Local service exposed to LAN | Loopback-only port publishing | Host firewall and verification |

## Required evidence

Keep the pinned source commit, build provenance, dependency lockfile, SBOM, source-audit result,
test output, firewall policy, DNS/packet capture, access review, backup/restore result, and incident
response ownership with every production release.
