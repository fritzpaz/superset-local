import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthContext {
	sub: string;
	email: string;
	organizationIds: string[];
}

export interface WhereClause {
	fragment: string;
	params: unknown[];
}

export interface JwtVerificationConfig {
	audience: string;
	issuer: string;
	jwksUrl: string;
}

const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
	const cached = jwksByUrl.get(jwksUrl);
	if (cached) {
		return cached;
	}

	const jwks = createRemoteJWKSet(new URL(jwksUrl));
	jwksByUrl.set(jwksUrl, jwks);
	return jwks;
}

export async function verifyJWT(
	token: string,
	config: JwtVerificationConfig,
): Promise<AuthContext | null> {
	try {
		const { payload } = await jwtVerify(token, getJWKS(config.jwksUrl), {
			issuer: config.issuer,
			audience: config.audience,
		});

		const sub = payload.sub;
		const email = payload.email as string | undefined;
		const organizationIds = payload.organizationIds as string[] | undefined;

		if (!sub || !organizationIds) {
			return null;
		}

		return { sub, email: email ?? "", organizationIds };
	} catch {
		return null;
	}
}
