import { auth } from "@superset/auth/server";
import { isTrustedClientAzp } from "@superset/shared/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { decodeJwt } from "jose";

const { GET: _GET, POST: _POST } = toNextJsHandler(auth);

/**
 * Userinfo returns the token subject's identity, so mirror the trusted-client
 * `azp` gate applied at the tRPC and MCP boundaries. Reading the claim without
 * verifying the signature is sound here: `azp` cannot be altered without
 * breaking the signature, and tokens that fail decoding or verification are
 * rejected by Better Auth itself.
 */
function untrustedUserinfoResponse(req: Request): Response | null {
	const token = req.headers
		.get("authorization")
		?.match(/^Bearer\s+(.+)$/i)?.[1];
	if (!token) return null;
	let azp: unknown;
	try {
		azp = decodeJwt(token).azp;
	} catch {
		return null;
	}
	if (isTrustedClientAzp(azp)) return null;
	return new Response(JSON.stringify({ error: "invalid_token" }), {
		status: 401,
		headers: {
			"WWW-Authenticate": 'Bearer error="invalid_token"',
			"Content-Type": "application/json",
		},
	});
}

/**
 * Normalize localhost variants in a URL so that `localhost` and `127.0.0.1`
 * are treated as equivalent. OAuth 2.1 requires exact string matching on
 * redirect_uri, but some MCP clients (e.g. OpenCode) register with
 * `127.0.0.1` and then authorize with `localhost` (or vice-versa).
 */
function normalizeLocalhostUri(uri: string): string {
	return uri.replace(/^(https?:\/\/)localhost(:\d+)/, "$1127.0.0.1$2");
}

const GET = async (req: Request) => {
	const url = new URL(req.url);
	if (url.pathname.endsWith("/oauth2/userinfo")) {
		const rejected = untrustedUserinfoResponse(req);
		if (rejected) return rejected;
	}
	if (url.pathname.endsWith("/oauth2/authorize")) {
		const redirectUri = url.searchParams.get("redirect_uri");
		if (redirectUri) {
			const normalized = normalizeLocalhostUri(redirectUri);
			if (normalized !== redirectUri) {
				url.searchParams.set("redirect_uri", normalized);
				return _GET(new Request(url.toString(), req));
			}
		}
	}
	return _GET(req);
};

const POST = async (req: Request) => {
	const url = new URL(req.url);
	if (url.pathname.endsWith("/oauth2/userinfo")) {
		const rejected = untrustedUserinfoResponse(req);
		if (rejected) return rejected;
	}
	if (url.pathname.endsWith("/oauth2/register")) {
		const cloned = req.clone();
		const body = await cloned.json().catch(() => null);
		if (body?.redirect_uris && Array.isArray(body.redirect_uris)) {
			body.redirect_uris = body.redirect_uris.map(normalizeLocalhostUri);
			return _POST(
				new Request(req.url, {
					method: req.method,
					headers: req.headers,
					body: JSON.stringify(body),
				}),
			);
		}
	}
	if (url.pathname.endsWith("/oauth2/token")) {
		const cloned = req.clone();
		const contentType = req.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const body = await cloned.json().catch(() => null);
			if (body?.redirect_uri && typeof body.redirect_uri === "string") {
				const normalized = normalizeLocalhostUri(body.redirect_uri);
				if (normalized !== body.redirect_uri) {
					body.redirect_uri = normalized;
					return _POST(
						new Request(req.url, {
							method: req.method,
							headers: req.headers,
							body: JSON.stringify(body),
						}),
					);
				}
			}
		} else {
			const params = new URLSearchParams(await cloned.text());
			const redirectUri = params.get("redirect_uri");
			if (redirectUri) {
				const normalized = normalizeLocalhostUri(redirectUri);
				if (normalized !== redirectUri) {
					params.set("redirect_uri", normalized);
					return _POST(
						new Request(req.url, {
							method: req.method,
							headers: req.headers,
							body: params.toString(),
						}),
					);
				}
			}
		}
	}
	return _POST(req);
};

export { GET, POST };
