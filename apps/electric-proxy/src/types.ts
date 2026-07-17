export interface Env {
	AUTH_JWKS_URL: string;
	AUTH_JWT_AUDIENCE: string;
	AUTH_JWT_ISSUER: string;
	ELECTRIC_ALLOWED_ORIGIN?: string;
	ELECTRIC_SHAPE_URL?: string;
	ELECTRIC_SECRET?: string;
	ELECTRIC_SOURCE_ID?: string;
	ELECTRIC_SOURCE_SECRET?: string;
}
