# Deployment and configuration

## Profiles

`local` runs Postgres 17, Redis 7, Electric 1.7, and a Neon compatibility proxy with persistent
Docker volumes. All published ports bind to loopback. Image tags are configurable with
`SUP_LOCAL_*_IMAGE` variables so release tooling can pin organization-approved digests.

`external` starts no services. Provide Postgres, Redis, and Electric URLs at initialization.
Their hostnames are copied into the application allowlist; secrets are written only to the
mode-`0600` runtime file. Use `--electric-secret` or `ELECTRIC_SECRET` when the external Electric
service requires one.

This initial implementation does not support mixing local and external services in one profile.
That should be added only after upstream's exact service requirements are integrated and tested.

## Production checklist

Before treating a build as local-only:

1. Import and pin an upstream Superset commit.
2. Implement every item in `integration/runtime-contract.json` and set its status to `verified`.
3. Run unit, integration, desktop, CLI, SDK, and MCP tests.
4. Run `npm run audit:endpoints`; review every allow-reference marker.
5. Build from an internal package and container mirror with image digests and a locked dependency
   graph. A runtime can be offline only after its packages, app artifacts, and images are staged.
6. Apply an outbound default-deny firewall. Allow only explicitly approved model providers, Git
   hosts, artifact mirrors, and operator infrastructure.
7. Explicitly deny `superset.sh` and `*.superset.sh` in DNS and egress policy.
8. Exercise sign-in, project/workspace creation, terminals, agents, diffs, ports, automations,
   diagnostics, and update flows while capturing DNS and traffic.
9. Confirm no request leaves through a system browser, updater, crash reporter, child process, or
   Electron utility process.
10. Sign the build, archive the SBOM/test evidence, and record the upstream commit.

## Secret handling

The generated runtime environment contains database credentials, auth secrets, and an AES key.
It is gitignored and created with mode `0600`. For multi-user or production systems, replace the
file-backed secret mechanism with the operator's secret manager without placing secrets in the
non-secret JSON config.

`superset-local config` never prints secret values. `superset-local run` injects them directly
into the child process. Environment variables may still be visible to privileged local users and
process-inspection tooling.

## Backup and recovery

`superset-local down` retains data. Do not use `docker compose down --volumes` as an ordinary
teardown command. Define encrypted database backups, restore tests, retention, and audit logging
before production use. External-profile backup and availability are entirely operator-owned.

## Egress verification

Application source review is necessary but insufficient. Test a release in a clean VM with an
empty DNS cache and default-deny egress. Capture denied attempts as well as allowed traffic. A
successful test has no lookup or connection attempt for a Superset-operated domain—not merely no
successful response.
