# Modification notice

This distribution has been modified from Superset by the Superset Local maintainers.

Current verified upstream base: `b13a92c7d665e7b4019b06626ae2596005911340` (July 17, 2026).

The modifications are intended to:

- replace Superset-operated runtime dependencies with local or operator-controlled services;
- add explicit endpoint configuration with no Superset-hosted defaults;
- disable cloud, Relay, telemetry, diagnostics upload, and automatic update connections;
- prevent upstream preview, production, and Relay deployment jobs from running in the fork;
- add a local initializer, service appliance, endpoint policy, verification, and documentation;
- preserve Superset copyright, attribution, license notices, and license-key functionality.

This notice is provided to satisfy the prominent-modification requirement in the Elastic
License 2.0. The verified upstream base commit must be recorded in
`integration/runtime-contract.json` for every release. The local-mode changes are concentrated in
`appliance/`, `packages/shared/src/local-runtime.ts`, application composition roots, auth seeding,
and the web/API hosted-route boundaries to minimize future upstream merge conflicts.
