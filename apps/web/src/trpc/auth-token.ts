import { env } from "../env";
import { decodeJwtExpiresAtMs } from "./jwt-expiry";

// Better Auth user JWT for relay-fronted host-service calls. The deployment's
// security policy controls its lifetime, so use the signed expiry rather than
// assuming the default one-hour duration.
interface CachedToken {
	expiresAtMs: number;
	token: string;
}

let cached: CachedToken | null = null;
const JWT_REFRESH_LEEWAY_MS = 60_000;

export async function getAuthToken(): Promise<string> {
	if (cached && Date.now() < cached.expiresAtMs - JWT_REFRESH_LEEWAY_MS) {
		return cached.token;
	}
	const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/auth/token`, {
		credentials: "include",
	});
	if (!response.ok) {
		throw new Error(`Auth token request failed (${response.status})`);
	}
	const body = (await response.json()) as { token?: string };
	if (!body.token) throw new Error("Auth token response missing token");
	const expiresAtMs = decodeJwtExpiresAtMs(body.token);
	cached = expiresAtMs ? { token: body.token, expiresAtMs } : null;
	return body.token;
}
