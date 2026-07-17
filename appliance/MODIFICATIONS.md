# Modification notice

This distribution has been modified from Superset by the Superset Local maintainers.

The modifications are intended to:

- replace Superset-operated runtime dependencies with local or operator-controlled services;
- add explicit endpoint configuration with no Superset-hosted defaults;
- disable cloud, Relay, telemetry, diagnostics upload, and automatic update connections;
- add a local initializer, service appliance, endpoint policy, verification, and documentation;
- preserve Superset copyright, attribution, license notices, and license-key functionality.

This notice is provided to satisfy the prominent-modification requirement in the Elastic
License 2.0. The verified upstream base commit must be recorded in
`integration/runtime-contract.json` for every release.
