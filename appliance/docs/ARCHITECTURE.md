# Architecture

Superset Local is deliberately an additive layer with one narrow upstream patch set. Keeping
locality decisions outside feature code reduces merge conflicts and makes new network behavior
visible during upgrades.

```text
desktop / web / CLI / SDK / MCP
              |
       local runtime adapter
       |        |          |
 endpoint   local auth   feature gates
  policy
       |
 local API and host server (loopback only)
       |
 Postgres + Redis + Electric
 (local Compose or operator infrastructure)
```

## Boundaries

The appliance layer owns configuration generation, secrets, backing services, process launch,
endpoint validation, and endpoint auditing. Upstream owns the UI, workspace orchestration,
terminals, worktrees, diff viewer, agents, and entitlement decisions.

The upstream patch does four things:

1. Resolve every service origin through a local runtime adapter with no hosted default.
2. Route every Superset-owned outbound request through `createEndpointPolicy`.
3. Provide production-grade local authentication and organization identity.
4. Hide or fail closed on cloud-dependent UI and entrypoints when their gate is disabled.

Do not scatter `if (local)` checks through feature components. Prefer dependency injection at
process composition roots and stable interfaces for auth, projects, hosts, updates, telemetry,
and diagnostics.

## Runtime contract

`integration/runtime-contract.json` is release evidence. It pins the exact upstream base and is
marked verified only after the generated configuration, local auth, production builds,
middleware gates, source audit, monorepo tests, and container smoke tests pass.

Environment flags are explicit and default to disabled in generated configurations:

- `SUPERSET_CLOUD_DISABLED=true`
- `SUPERSET_RELAY_DISABLED=true`
- `SUPERSET_TELEMETRY_DISABLED=true`
- `SUPERSET_AUTO_UPDATE_DISABLED=true`

Application composition roots consume local mode directly. The endpoint policy, hosted-route
middleware, reviewed endpoint baseline, and operator network firewall are independent layers.

## Data flow

Local mode binds each published port to `127.0.0.1`; Docker services communicate on their private
Compose network. External mode omits the local Postgres, Redis, Electric, and Neon services while
retaining the application services and Redis HTTP adapter. Only supplied infrastructure hosts
are added to policy metadata. Application API and web origins remain loopback in both profiles.

Agent CLIs are child processes and may call their configured model providers. The JavaScript
endpoint guard cannot constrain child processes, Git, package managers, browsers, or arbitrary
terminal commands. Host firewall and sandbox policy must cover those paths.
