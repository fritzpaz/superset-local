# Upstream integration

This directory is the handoff point between the appliance and the Superset source tree.

`runtime-contract.json` must remain `not-integrated` until all upstream entrypoints use the local
runtime adapter and tests cover success and failure paths. To mark it verified:

1. Set `verifiedCommit` to the exact upstream Git commit included in the build.
2. Set `status` to `verified` only after every `requiredGate` is enforced by application code.
3. Add tests that fail if a flag is absent, false, or malformed.
4. Run the endpoint audit and justify any source-line exception with the marker
   `superset-local: allow-reference` and a reason on that same line.
5. Verify with an outbound firewall and DNS/packet capture.

Do not use the contract to change or bypass paid-feature license enforcement.
