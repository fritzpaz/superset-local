import { describe, expect, mock, test } from "bun:test";
import { resolveJwtAuthorization } from "./resolve-jwt-authorization";

function dependencies() {
	return {
		findLiveOrganizationIds: mock(async () => ["org-live"]),
		isSessionActive: mock(async () => true),
	};
}

describe("resolveJwtAuthorization", () => {
	test("preserves claim-based behavior outside regulated mode", async () => {
		const deps = dependencies();
		const result = await resolveJwtAuthorization(
			{
				sub: "user-1",
				email: "user@example.com",
				organizationIds: ["org-claim", "org-claim", 1],
				sid: "session-1",
			},
			{ requireLiveState: false, dependencies: deps },
		);

		expect(result).toEqual({
			userId: "user-1",
			email: "user@example.com",
			organizationIds: ["org-claim"],
			activeOrganizationId: "org-claim",
		});
		expect(deps.findLiveOrganizationIds).not.toHaveBeenCalled();
		expect(deps.isSessionActive).not.toHaveBeenCalled();
	});

	test("uses live memberships for regulated bearer authorization", async () => {
		const deps = dependencies();
		const result = await resolveJwtAuthorization(
			{
				sub: "user-1",
				organizationIds: ["org-stale"],
				sid: "session-1",
			},
			{ requireLiveState: true, dependencies: deps },
		);

		expect(result?.organizationIds).toEqual(["org-live"]);
		expect(deps.isSessionActive).toHaveBeenCalledWith("session-1", "user-1");
		expect(deps.findLiveOrganizationIds).toHaveBeenCalledWith("user-1");
	});

	test("rejects a regulated token whose backing session was revoked", async () => {
		const deps = dependencies();
		deps.isSessionActive.mockImplementation(async () => false);

		const result = await resolveJwtAuthorization(
			{
				sub: "user-1",
				organizationIds: ["org-stale"],
				sid: "session-revoked",
			},
			{ requireLiveState: true, dependencies: deps },
		);

		expect(result).toBeNull();
		expect(deps.findLiveOrganizationIds).not.toHaveBeenCalled();
	});

	test("supports short-lived service tokens without a session id", async () => {
		const deps = dependencies();
		const result = await resolveJwtAuthorization(
			{ sub: "user-1", organizationIds: ["org-stale"] },
			{ requireLiveState: true, dependencies: deps },
		);

		expect(result?.organizationIds).toEqual(["org-live"]);
		expect(deps.isSessionActive).not.toHaveBeenCalled();
	});
});
