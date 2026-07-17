# Feature compatibility

This matrix is the release target. Rows marked “expected” still require validation after the
upstream application tree is integrated.

| Feature | Local target | Reason or replacement |
| --- | --- | --- |
| Local Git repositories and worktrees | Expected | Filesystem and Git are local |
| Terminals, panes, presets, and agent launches | Expected | Local host process; agent providers remain operator-selected |
| Diff viewer, editor, browser preview, and port detection | Expected | Local desktop and loopback host server |
| Local setup/teardown/run scripts | Expected | Filesystem and child processes are local |
| Local scheduled automations | Expected | Requires local scheduler validation |
| Postgres, Redis, and Electric | Supported by appliance | Local Compose or operator-controlled URLs |
| Production sign-in | Replacement required | Upstream development sign-in is not a hardened production auth system |
| Superset account and organization management | Unavailable | Requires Superset cloud identity/control plane |
| Shared cloud project registry and organization discovery | Unavailable | Replace with local database records/import workflow |
| Remote hosts and remote workspaces | Unavailable | Traffic is routed through Superset Relay |
| Mobile access to remote workspaces | Unavailable | Depends on remote host discovery and Relay |
| Superset Relay | Disabled | No Superset-operated service is allowed in the data path |
| Organization-wide CLI listing and remote CLI targets | Unavailable | Cloud API and Relay dependent; `--local` behavior is the target |
| Remote SDK and MCP control | Unavailable | Local loopback transports may be retained after validation |
| Superset-managed Slack and Linear workflows | Unavailable | Cloud OAuth/webhook/control-plane dependent; direct local plugins may be designed separately |
| Subscription and license administration | Unavailable offline | License-key and entitlement enforcement must not be changed or bypassed |
| Superset-hosted updates and release discovery | Disabled | Use signed internal artifacts and an operator-controlled update channel |
| Usage analytics, crash upload, and shared diagnostics | Disabled | Logs remain local; manual export requires review and redaction |
| Hosted docs, marketing, changelog, and support links | Disabled or external-browser only | They must never be contacted automatically |
| OAuth through Superset-configured providers | Replacement required | Configure operator-controlled OIDC or local auth directly |

## External dependencies that are still allowed

“Local” means no Superset-operated runtime dependency. It does not make an agent model, Git host,
package registry, OAuth provider, database, or observability system local. Each optional external
system must be explicitly configured and reviewed. In regulated deployments it may require its
own contract, BAA, retention policy, and egress rule.

## Release rule

An upstream feature is disabled by default until its complete data path is understood. A feature
becomes supported only after tests demonstrate that it works without a Superset endpoint and its
dependencies are listed in the generated configuration and threat model.
