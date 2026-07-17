import { fromBase64 } from "./base64";

export const JWT_REFRESH_LEEWAY_MS = 60_000;
const JWT_FALLBACK_LIFETIME_MS = 5 * 60_000;

export function decodeJwtExpiresAtMs(token: string): number | null {
	try {
		const payloadPart = token.split(".")[1];
		if (!payloadPart) return null;
		const normalized = payloadPart
			.replace(/-/g, "+")
			.replace(/_/g, "/")
			.padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
		const payload = JSON.parse(
			new TextDecoder().decode(fromBase64(normalized)),
		) as { exp?: unknown };
		return typeof payload.exp === "number" ? payload.exp * 1000 : null;
	} catch {
		return null;
	}
}

export function getJwtExpiresAtMs(token: string, now: number): number {
	return decodeJwtExpiresAtMs(token) ?? now + JWT_FALLBACK_LIFETIME_MS;
}
