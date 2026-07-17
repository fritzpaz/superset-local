# Maintaining the fork

The goal is a small, reviewable delta from `superset-sh/superset`, with appliance code isolated
from upstream feature code.

## Repository model

- `origin` is the operator-owned `superset-local` repository.
- `upstream` is `https://github.com/superset-sh/superset.git` and is fetch-only.
- `main` contains upstream history plus reviewed Superset Local commits.
- Feature work uses short-lived branches and normal main-based pull requests.

The current repository preserves upstream ancestry. `origin` is the `superset-local` GitHub fork
and `upstream` is configured fetch-only.

## Routine update

```sh
git fetch upstream --tags
git switch -c update/upstream-<version> main
git merge --no-ff upstream/main
npm --prefix appliance run audit:endpoints
npm --prefix appliance run check
```

Then inspect new or changed code for:

- HTTP/WebSocket clients and hard-coded URLs;
- auth, organization, project, host, Relay, CLI, SDK, and MCP paths;
- Electron updater, crash reporter, diagnostics, analytics, link opening, and embedded browser;
- new child binaries or service workers;
- environment defaults that silently select hosted services;
- database schema and Electric compatibility changes;
- license-key or entitlement code, which must remain intact.

Do not regenerate `endpoint-baseline.json` until every changed reference has been reviewed. Update
the feature matrix and threat model, record the tested upstream commit in the runtime contract,
and open one pull request. Never mark the contract verified based only on compilation.

## Conflict minimization

Keep appliance-specific code in stable new modules. In upstream files, prefer one import and one
adapter injection at composition roots. Avoid branding-only churn, broad renames, generated-file
edits, formatting unrelated code, or forks of entire components. Tests should exercise interfaces
and failure behavior so upstream refactors produce clear, localized failures.

## Release checklist

1. Upstream merge and licensing review complete.
2. Runtime contract pinned and verified.
3. Feature matrix reviewed for new hosted dependencies.
4. Full tests, endpoint audit, SBOM, signing, and offline installation pass.
5. Egress capture shows no attempted Superset connection.
6. Modification notice and ELv2 license ship in every artifact.
