import { describe, expect, spyOn, test } from "bun:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { handler } from "./index";
import type { Env } from "./types";

const env: Env = {
	AUTH_JWKS_URL: "https://auth.internal.example.test/api/auth/jwks",
	AUTH_JWT_AUDIENCE: "https://app.example.test",
	AUTH_JWT_ISSUER: "https://app.example.test",
	ELECTRIC_ALLOWED_ORIGIN: "https://app.example.test, superset-app://renderer",
	ELECTRIC_SHAPE_URL: "https://electric.example.test/v1/shape",
};
describe("Electric proxy perimeter", () => {
	test("exposes a credential-free health check", async () => {
		const response = await handler.fetch(
			new Request("https://app.example.test/_health"),
			env,
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	test("allows preflight only from configured web and desktop origins", async () => {
		const allowed = await handler.fetch(
			new Request("https://app.example.test/v1/shape", {
				headers: { Origin: "https://app.example.test" },
				method: "OPTIONS",
			}),
			env,
		);
		const packagedDesktop = await handler.fetch(
			new Request("https://app.example.test/v1/shape", {
				headers: { Origin: "superset-app://renderer" },
				method: "OPTIONS",
			}),
			env,
		);
		const denied = await handler.fetch(
			new Request("https://app.example.test/v1/shape", {
				headers: { Origin: "https://other.example.test" },
				method: "OPTIONS",
			}),
			env,
		);

		expect(allowed.status).toBe(204);
		expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://app.example.test",
		);
		expect(packagedDesktop.status).toBe(204);
		expect(packagedDesktop.headers.get("Access-Control-Allow-Origin")).toBe(
			"superset-app://renderer",
		);
		expect(denied.status).toBe(403);
		expect(denied.headers.has("Access-Control-Allow-Origin")).toBe(false);
	});

	test("never trusts the opaque packaged file origin", async () => {
		const response = await handler.fetch(
			new Request("https://app.example.test/v1/shape", {
				headers: { Origin: "null" },
				method: "OPTIONS",
			}),
			{
				...env,
				ELECTRIC_ALLOWED_ORIGIN: `${env.ELECTRIC_ALLOWED_ORIGIN},null`,
			},
		);

		expect(response.status).toBe(403);
		expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
	});

	test("does not reflect an arbitrary origin on an auth failure", async () => {
		const response = await handler.fetch(
			new Request("https://app.example.test/v1/shape", {
				headers: { Origin: "https://other.example.test" },
			}),
			env,
		);

		expect(response.status).toBe(401);
		expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
	});

	test("validates a public-issuer JWT with keys fetched from the internal auth URL", async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256");
		const publicJwk = await exportJWK(publicKey);
		const token = await new SignJWT({
			email: "operator@example.test",
			organizationIds: ["organization-1"],
		})
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setSubject("user-1")
			.setIssuer(env.AUTH_JWT_ISSUER)
			.setAudience(env.AUTH_JWT_AUDIENCE)
			.setIssuedAt()
			.setExpirationTime("5m")
			.sign(privateKey);
		const fetchedUrls: string[] = [];
		const fetchImplementation = Object.assign(
			async (input: Parameters<typeof fetch>[0]) => {
				const url = input instanceof Request ? input.url : input.toString();
				fetchedUrls.push(url);
				if (url === env.AUTH_JWKS_URL) {
					return Response.json({
						keys: [{ ...publicJwk, alg: "RS256", kid: "test-key", use: "sig" }],
					});
				}
				if (url.startsWith(env.ELECTRIC_SHAPE_URL ?? "")) {
					return new Response("authorized shape", { status: 200 });
				}
				return new Response("unexpected URL", { status: 500 });
			},
			{ preconnect: globalThis.fetch.preconnect },
		);
		const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
			fetchImplementation,
		);
		const authorizedRequest = () =>
			new Request(
				"https://app.example.test/v1/shape?table=tasks&organizationId=organization-1",
				{
					headers: {
						Authorization: `Bearer ${token}`,
						Origin: "https://app.example.test",
					},
				},
			);

		try {
			const issuerMismatch = await handler.fetch(authorizedRequest(), {
				...env,
				AUTH_JWT_ISSUER: "https://auth.internal.example.test",
			});
			const response = await handler.fetch(authorizedRequest(), env);

			expect(issuerMismatch.status).toBe(401);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("authorized shape");
			expect(fetchedUrls[0]).toBe(env.AUTH_JWKS_URL);
			expect(fetchedUrls).toHaveLength(2);
		} finally {
			fetchSpy.mockRestore();
		}
	});
});
