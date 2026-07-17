# Feature compatibility

This matrix describes the local-mode behavior at the pinned upstream commit recorded in the
runtime contract.

| Feature | Local target | Reason or replacement |
| --- | --- | --- |
| Local Git repositories and worktrees | Supported | Filesystem and Git remain local; the full upstream test suite covers host/worktree behavior |
| Terminals, panes, presets, and agent launches | Supported in desktop | Local host process; agent providers remain operator-selected |
| Diff viewer, editor, browser preview, and port detection | Supported in desktop | Local desktop and loopback host server |
| Local setup/teardown/run scripts | Supported | Filesystem and child processes are local |
| Local scheduled automations | Unavailable | Upstream scheduling depends on QStash and Relay; API routes fail closed |
| Postgres, Redis, and Electric | Supported by appliance | Local Compose or operator-controlled URLs |
| Production sign-in | Supported | Better Auth email/password with generated administrator credentials |
| Local users and organizations | Supported | Stored in appliance Postgres; organization creation skips Stripe side effects in local mode |
| Shared cloud project registry and organization discovery | Local records only | No Superset identity/control plane |
| Remote hosts and remote workspaces | Unavailable | Traffic is routed through Superset Relay |
| Mobile access to remote workspaces | Unavailable | Depends on remote host discovery and Relay |
| Superset Relay | Disabled | No Superset-operated service is allowed in the data path |
| Organization-wide CLI listing and remote CLI targets | Unavailable | Cloud API and Relay dependent; `--local` behavior is the target |
| SDK and MCP control | Loopback only | SDK requires explicit local API/Relay URLs and rejects Superset-operated URLs |
| Superset-managed Slack and Linear workflows | Unavailable | Cloud OAuth/webhook/control-plane dependent; direct local plugins may be designed separately |
| Subscription and license administration | Unavailable offline | License-key and entitlement enforcement must not be changed or bypassed |
| Superset-hosted updates and release discovery | Disabled | Use signed internal artifacts and an operator-controlled update channel |
| Usage analytics, crash upload, and shared diagnostics | Disabled | Logs remain local; manual export requires review and redaction |
| Hosted docs, marketing, changelog, and support links | Disabled | Generated values point to the local web origin; support routes fail closed |
| GitHub/Google login | Disabled | Local email/password replaces hosted OAuth |
| GitHub, Slack, Linear, Tavily, QStash integrations | Disabled by default | Web/API entrypoints return 404 in local mode; no provider credentials are required |
| Web/API container | Supported | Optimized Next.js production builds with migration, seed, and health checks |
| Electron container | Not applicable | Electron is built for the host OS, not the headless service image |

## External dependencies that are still allowed

“Local” means no Superset-operated runtime dependency. It does not make an agent model, Git host,
package registry, OAuth provider, database, or observability system local. Each optional external
system must be explicitly configured and reviewed. In regulated deployments it may require its
own contract, BAA, retention policy, and egress rule.

## Release rule

An upstream feature is disabled by default until its complete data path is understood. A feature
becomes supported only after tests demonstrate that it works without a Superset endpoint and its
dependencies are listed in the generated configuration and threat model.
