export interface JwtAuthorization {
	activeOrganizationId: string | null;
	email: string;
	organizationIds: string[];
	userId: string;
}

export interface JwtAuthorizationDependencies {
	findLiveOrganizationIds: (userId: string) => Promise<string[]>;
	isSessionActive: (sessionId: string, userId: string) => Promise<boolean>;
}

/**
 * Resolves the authorization state used by bearer-authenticated tRPC calls.
 * In regulated mode, organization claims are treated only as token metadata:
 * the current database memberships are authoritative, and session-derived
 * tokens are rejected as soon as their backing session is gone or expired.
 */
export async function resolveJwtAuthorization(
	payload: Record<string, unknown>,
	options: {
		requireLiveState: boolean;
		dependencies: JwtAuthorizationDependencies;
	},
): Promise<JwtAuthorization | null> {
	if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;

	const userId = payload.sub;
	const email = typeof payload.email === "string" ? payload.email : "";
	const claimedOrganizationIds = Array.isArray(payload.organizationIds)
		? [
				...new Set(
					payload.organizationIds.filter(
						(organizationId): organizationId is string =>
							typeof organizationId === "string",
					),
				),
			]
		: [];

	if (!options.requireLiveState) {
		return {
			userId,
			email,
			organizationIds: claimedOrganizationIds,
			activeOrganizationId: claimedOrganizationIds[0] ?? null,
		};
	}

	if (
		typeof payload.sid === "string" &&
		!(await options.dependencies.isSessionActive(payload.sid, userId))
	) {
		return null;
	}

	const organizationIds = [
		...new Set(await options.dependencies.findLiveOrganizationIds(userId)),
	];
	return {
		userId,
		email,
		organizationIds,
		activeOrganizationId: organizationIds[0] ?? null,
	};
}
