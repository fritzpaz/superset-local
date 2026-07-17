import { describe, expect, test } from "bun:test";
import { buildCloudWatchLogsKeyPolicy } from "./logging-key-policy";

interface PolicyStatement {
	Action: string | string[];
	Condition?: Record<string, Record<string, string | string[]>>;
	Principal: Record<string, string | string[]>;
	Sid: string;
}

interface KeyPolicy {
	Statement: PolicyStatement[];
}

function statement(policy: KeyPolicy, sid: string): PolicyStatement {
	const result = policy.Statement.find((entry) => entry.Sid === sid);
	if (!result) throw new Error(`Missing ${sid} statement`);
	return result;
}

describe("CloudWatch Logs KMS key policy", () => {
	const accountId = "111122223333";
	const callerArn = `arn:aws:iam::${accountId}:role/superset-execution`;
	const logGroupArns = [
		`arn:aws:logs:us-east-1:${accountId}:log-group:/superset/production/application`,
		`arn:aws:logs:us-east-1:${accountId}:log-group:/superset/production/electric`,
	];
	const policy = JSON.parse(
		buildCloudWatchLogsKeyPolicy({
			accountId,
			callerArns: [callerArn],
			logGroupArns,
			region: "us-east-1",
		}),
	) as KeyPolicy;

	test("retains account-root administration for IAM delegation", () => {
		const account = statement(policy, "EnableAccountIAMPolicies");
		expect(account.Principal).toEqual({
			AWS: `arn:aws:iam::${accountId}:root`,
		});
		expect(account.Action).toBe("kms:*");
	});

	test("authorizes only the regional Logs service for known log groups", () => {
		const logs = statement(policy, "AllowCloudWatchLogsEncryption");
		expect(logs.Principal).toEqual({
			Service: "logs.us-east-1.amazonaws.com",
		});
		expect(
			logs.Condition?.ArnEquals?.["kms:EncryptionContext:aws:logs:arn"],
		).toEqual(logGroupArns);
		expect(logs.Action).toContain("kms:GenerateDataKey*");
	});

	test("limits the ECS caller to use through the regional Logs endpoint", () => {
		const caller = statement(
			policy,
			"AllowApprovedCallersThroughCloudWatchLogs",
		);
		expect(caller.Principal).toEqual({ AWS: [callerArn] });
		expect(caller.Condition?.StringEquals?.["kms:ViaService"]).toBe(
			"logs.us-east-1.amazonaws.com",
		);
		expect(
			caller.Condition?.ArnEquals?.["kms:EncryptionContext:aws:logs:arn"],
		).toEqual(logGroupArns);
	});
});
