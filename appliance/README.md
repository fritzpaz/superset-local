# Superset Local

> **Modified distribution notice:** Superset Local is an independent, modified distribution
> based on the Superset source code. It is not the hosted Superset service and is not endorsed
> by Superset. Superset Local is distributed under the Elastic License 2.0; see
> [LICENSE.md](LICENSE.md) and [MODIFICATIONS.md](MODIFICATIONS.md).

Superset Local is the appliance and policy layer for running Superset without any
Superset-operated runtime service. It supports either loopback-only Postgres, Redis, and
Electric containers or operator-provided infrastructure. Configuration has no fallback to a
`superset.sh` endpoint, and those hosts are rejected even when explicitly supplied.

## Current status

This repository currently contains the appliance foundation, not a production-ready desktop
distribution. The task workspace was created without the upstream application source or a Git
remote, so the generated disable flags are not yet wired into Superset's Electron, web, API,
CLI, SDK, and MCP request paths. `superset-local doctor --strict` intentionally fails until the
integration contract is implemented and verified against a pinned upstream commit.

Do not use this revision as evidence of HIPAA compliance or as proof that Superset cannot make
outbound connections. See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Install

From a source checkout:

```sh
./scripts/install.sh
export PATH="${SUPERSET_LOCAL_HOME:-$HOME/.superset-local-appliance}/bin:$PATH"
superset-local --help
```

It can also be installed as a normal Node command:

```sh
npm install --global .
```

Node.js 20 or newer is required. The local service profile also requires Docker Compose. The
eventual desktop release will bundle this command and the patched upstream application.

## Configure a fully local stack

Run this from the Superset source root:

```sh
superset-local init --profile local
superset-local doctor
superset-local up
superset-local run -- npm run dev
```

The initializer writes:

- `superset-local.json`: non-secret appliance configuration;
- `.superset-local/runtime.env`: generated credentials and upstream-compatible environment
  variables, mode `0600`;
- a unique Compose project name, so separate checkouts do not share state.

Postgres, Redis, Electric, and the Neon compatibility proxy bind to `127.0.0.1`. Persistent
volumes are retained by `superset-local down`.

## Use operator-provided infrastructure

The application API and web origins remain on loopback. Database, cache, and Electric can live
on your network:

```sh
superset-local init --profile external \
  --database-url "$DATABASE_URL" \
  --database-url-unpooled "$DATABASE_URL_UNPOOLED" \
  --redis-url "$REDIS_URL" \
  --electric-url "$ELECTRIC_URL"

superset-local doctor
superset-local run -- npm run dev
```

Infrastructure hostnames are added to the generated default-deny allowlist. Additional hosts
must be explicit with `--allow-host`. Secrets stay in the private runtime file and are omitted
from `superset-local config` output.

## Safety model

The appliance uses three layers:

1. Configuration rejects `superset.sh` and every subdomain and requires local app origins.
2. The runtime endpoint policy offers a guarded fetch boundary and a default-deny hostname
   allowlist.
3. `npm run audit:endpoints` finds unreviewed hard-coded Superset domains in upstream app code.

These are application controls, not a replacement for an outbound firewall. A production
deployment must use OS/network egress enforcement and packet/DNS capture as described in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Architecture and integration contract](docs/ARCHITECTURE.md)
- [Deployment and configuration](docs/DEPLOYMENT.md)
- [Cloud-dependent feature matrix](docs/FEATURE_COMPATIBILITY.md)
- [Threat model and regulated-environment guidance](docs/THREAT_MODEL.md)
- [Upstream update workflow](docs/UPSTREAM_MAINTENANCE.md)

## Development

```sh
npm test
npm run check
npm run audit:endpoints
npm run pack:check
shellcheck scripts/install.sh
```

No paid-feature entitlement or license-key code may be removed, changed, disabled, or bypassed.
Local replacements must sit below entitlement decisions rather than altering them.
