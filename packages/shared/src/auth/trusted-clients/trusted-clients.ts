/**
 * OAuth clients whose access tokens may act with full user/org context.
 * Dynamic client registration is open to anyone, so every boundary that
 * trusts a token's `sub`/`organizationId` claims (tRPC, MCP, userinfo)
 * must reject tokens minted to clients outside this set.
 */
export const TRUSTED_API_CLIENTS: ReadonlySet<string> = new Set([
	"superset-cli",
]);

/** True when the token's `azp` claim is absent or names a trusted client. */
export function isTrustedClientAzp(azp: unknown): boolean {
	return typeof azp !== "string" || TRUSTED_API_CLIENTS.has(azp);
}
