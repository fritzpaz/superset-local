import { verifyJWT } from "./auth";
import { buildUpstreamUrl } from "./electric";
import type { Env } from "./types";
import { buildWhereClause } from "./where";

const BASE_CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Expose-Headers":
		"electric-handle, electric-offset, electric-schema, electric-up-to-date, electric-cursor",
};

function corsHeaders(request: Request, env: Env): Headers {
	const headers = new Headers(BASE_CORS_HEADERS);
	const requestOrigin = request.headers.get("Origin");
	if (requestOrigin && requestOrigin === env.ELECTRIC_ALLOWED_ORIGIN) {
		headers.set("Access-Control-Allow-Origin", requestOrigin);
	}
	headers.set("Vary", "Authorization, Origin");
	return headers;
}

function corsResponse(
	request: Request,
	env: Env,
	status: number,
	body: string,
): Response {
	return new Response(body, { status, headers: corsHeaders(request, env) });
}

function addCorsHeaders(
	response: Response,
	request: Request,
	env: Env,
): Response {
	const headers = new Headers(response.headers);
	if (headers.get("content-encoding")) {
		headers.delete("content-encoding");
		headers.delete("content-length");
	}
	for (const [key, value] of corsHeaders(request, env)) {
		headers.set(key, value);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export const handler = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/_health") {
			return new Response("ok", {
				status: 200,
				headers: { "Cache-Control": "no-store" },
			});
		}

		if (request.method === "OPTIONS") {
			const requestOrigin = request.headers.get("Origin");
			if (!requestOrigin || requestOrigin !== env.ELECTRIC_ALLOWED_ORIGIN) {
				return corsResponse(request, env, 403, "Origin not allowed");
			}
			return new Response(null, {
				status: 204,
				headers: corsHeaders(request, env),
			});
		}

		if (request.method !== "GET") {
			return corsResponse(request, env, 405, "Method not allowed");
		}

		const authHeader = request.headers.get("Authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			return corsResponse(
				request,
				env,
				401,
				"Missing or invalid Authorization header",
			);
		}

		const token = authHeader.slice(7);
		const auth = await verifyJWT(token, env.AUTH_URL);
		if (!auth) {
			return corsResponse(request, env, 401, "Invalid or expired token");
		}

		const tableName = url.searchParams.get("table");
		if (!tableName) {
			return corsResponse(request, env, 400, "Missing table parameter");
		}

		const organizationId = url.searchParams.get("organizationId");

		if (tableName !== "auth.organizations") {
			if (!organizationId) {
				return corsResponse(
					request,
					env,
					400,
					"Missing organizationId parameter",
				);
			}
			if (!auth.organizationIds.includes(organizationId)) {
				return corsResponse(
					request,
					env,
					403,
					"Not a member of this organization",
				);
			}
		}

		const authorizedOrganizationIds = [...auth.organizationIds].sort();
		const whereClause = buildWhereClause(
			tableName,
			organizationId ?? "",
			authorizedOrganizationIds,
		);
		if (!whereClause) {
			return corsResponse(request, env, 400, `Unknown table: ${tableName}`);
		}

		const upstreamUrl = buildUpstreamUrl(url, tableName, whereClause, env);
		const upstreamHeaders = new Headers(request.headers);
		upstreamHeaders.delete("Authorization");
		upstreamHeaders.delete("Cookie");

		const response = await fetch(upstreamUrl.toString(), {
			headers: upstreamHeaders,
		});

		return addCorsHeaders(response, request, env);
	},
} satisfies ExportedHandler<Env>;

export default handler;
