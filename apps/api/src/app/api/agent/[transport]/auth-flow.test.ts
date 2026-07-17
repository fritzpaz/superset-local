import { describe, expect, it } from "bun:test";
import { type McpRequestDeps, verifyToken } from "./auth-flow";

const JWT_SHAPED_TOKEN = "header.payload.signature";

function makeDeps(payload: Record<string, unknown>): McpRequestDeps {
	return {
		apiUrl: "http://localhost:3001",
		authApi: {
			getSession: async () => null,
			verifyApiKey: async () => ({ valid: false, key: null }),
		},
		createServer: (() => {
			throw new Error("createServer should not be called");
		}) as unknown as McpRequestDeps["createServer"],
		createTransport: () => {
			throw new Error("createTransport should not be called");
		},
		verifyAccessToken: (async () =>
			payload) as unknown as McpRequestDeps["verifyAccessToken"],
	};
}

function makeRequest(): Request {
	return new Request("http://localhost:3001/api/agent/mcp", {
		method: "POST",
		headers: { authorization: `Bearer ${JWT_SHAPED_TOKEN}` },
	});
}

const baseClaims = {
	sub: "victim-user",
	organizationId: "victim-org",
	scope: "mcp:full",
};

describe("verifyToken OAuth azp gate", () => {
	it("rejects a token minted to an untrusted (dynamically registered) client", async () => {
		const deps = makeDeps({ ...baseClaims, azp: "attacker-client" });

		const authInfo = await verifyToken(makeRequest(), deps);

		expect(authInfo).toBeUndefined();
	});

	it("accepts a token minted to superset-cli", async () => {
		const deps = makeDeps({ ...baseClaims, azp: "superset-cli" });

		const authInfo = await verifyToken(makeRequest(), deps);

		expect(authInfo?.extra?.mcpContext).toEqual({
			userId: "victim-user",
			organizationId: "victim-org",
		});
	});

	it("accepts a token with no azp claim", async () => {
		const deps = makeDeps({ ...baseClaims });

		const authInfo = await verifyToken(makeRequest(), deps);

		expect(authInfo?.extra?.mcpContext).toEqual({
			userId: "victim-user",
			organizationId: "victim-org",
		});
	});
});
