# Upstream integration

This directory is the handoff point between the appliance and the Superset source tree.

`runtime-contract.json` pins the upstream base tested with the appliance. To keep it verified:

1. Set `verifiedCommit` to the exact upstream Git commit included in the build.
2. Set `status` to `verified` only after every `requiredGate` is enforced by application code.
3. Add tests that fail if a flag is absent, false, or malformed.
4. Run the endpoint audit. Review changes to `endpoint-baseline.json` as security-sensitive
   evidence; fingerprints make changed source lines fail without modifying upstream files.
5. Verify with an outbound firewall and DNS/packet capture.

Do not use the contract to change or bypass paid-feature license enforcement.
