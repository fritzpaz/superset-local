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

The source appliance is integrated with upstream commit
`b13a92c7d665e7b4019b06626ae2596005911340`. It builds optimized API/web containers, migrates and
seeds the database, provides production email/password authentication, disables hosted OAuth,
telemetry, crash upload, updates, Relay defaults, and hosted integration routes, and supports
local or operator-provided Postgres, Redis, and Electric.

The Electron app can be built from the same generated environment, but it is not placed inside
the headless container. Provider CLIs, Git hosts, package registries, and operator infrastructure
remain optional external systems. This distribution is not evidence of HIPAA compliance; see
[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Install

From a source checkout:

```sh
./appliance/scripts/install.sh
export PATH="${SUPERSET_LOCAL_HOME:-$HOME/.superset-local-appliance}/bin:$PATH"
superset-local --help
```

It can also be installed as a normal Node command:

```sh
npm install --global ./appliance
```

Node.js 20 or newer is required. The local service profile also requires Docker Compose. The
eventual desktop release will bundle this command and the patched upstream application.

## Configure a fully local stack

Run this from the Superset source root:

```sh
superset-local init --profile local
superset-local doctor --strict
superset-local build
superset-local up
```

The generated configuration records that checkout as an absolute Docker build context, so an
installer-managed or globally installed command continues to build the intended source tree.
Use `--source-root /absolute/path/to/superset-local` when the config lives elsewhere.

The initializer writes:

- `superset-local.json`: non-secret appliance configuration;
- `.superset-local/runtime.env`: generated credentials and upstream-compatible environment
  variables, mode `0600`;
- a unique Compose project name, so separate checkouts do not share state.

Postgres, Redis, Electric, the Neon compatibility proxy, API, web app, authenticated Electric
proxy, and Redis HTTP compatibility service bind to `127.0.0.1`. `up` runs migrations and makes
the generated administrator ready. Persistent volumes are retained by `superset-local down`.

## Use operator-provided infrastructure

The application API and web origins remain on loopback. Database, cache, and Electric can live
on your network:

```sh
superset-local init --profile external \
  --database-url "$DATABASE_URL" \
  --database-url-unpooled "$DATABASE_URL_UNPOOLED" \
  --redis-url "$REDIS_URL" \
  --electric-url "$ELECTRIC_URL"

superset-local doctor --strict
superset-local build
superset-local up
```

Infrastructure hostnames are added to the generated default-deny allowlist. Additional hosts
must be explicit with `--allow-host`. Secrets stay in the private runtime file and are omitted
from `superset-local config` output.

## Safety model

The appliance uses three layers:

1. Configuration rejects `superset.sh` and every subdomain and requires local app origins.
2. API/web middleware rejects hosted integration, billing, update, analytics, support, and
   automation paths in local mode; desktop and SDK composition roots reject Superset origins.
3. `npm run audit:endpoints` compares shipped runtime code with a reviewed, fingerprinted
   endpoint baseline, so a new or changed Superset URL fails CI.

These are application controls, not a replacement for an outbound firewall. A production
deployment must use OS/network egress enforcement and packet/DNS capture as described in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Architecture and integration contract](docs/ARCHITECTURE.md)
- [Deployment and configuration](docs/DEPLOYMENT.md)
- [Cloud-dependent feature matrix](docs/FEATURE_COMPATIBILITY.md)
- [Threat model and regulated-environment guidance](docs/THREAT_MODEL.md)
- [HIPAA security gap and control matrix](docs/HIPAA_CONTROL_MATRIX.md)
- [AWS production infrastructure](../infra/aws/README.md)
- [Upstream update workflow](docs/UPSTREAM_MAINTENANCE.md)

## Development

```sh
npm --prefix appliance test
npm --prefix appliance run check
npm --prefix appliance run audit:endpoints
npm --prefix appliance run pack:check
shellcheck appliance/scripts/install.sh appliance/scripts/container-init.sh
```

No paid-feature entitlement or license-key code may be removed, changed, disabled, or bypassed.
Local replacements must sit below entitlement decisions rather than altering them.
