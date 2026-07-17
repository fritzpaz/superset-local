interface CloudWatchLogsKeyPolicyArgs {
	accountId: string;
	callerArns: string[];
	logGroupArns: string[];
	region: string;
}

const CLOUDWATCH_LOGS_KEY_ACTIONS = [
	"kms:Encrypt",
	"kms:Decrypt",
	"kms:ReEncrypt*",
	"kms:GenerateDataKey*",
	"kms:Describe*",
] as const;

/**
 * Builds the AWS-recommended KMS key policy for CloudWatch Logs, scoped to
 * explicit log-group encryption contexts and callers using the regional Logs
 * service. The account-root statement delegates administration to IAM without
 * granting workload principals direct, unrestricted key use.
 */
export function buildCloudWatchLogsKeyPolicy({
	accountId,
	callerArns,
	logGroupArns,
	region,
}: CloudWatchLogsKeyPolicyArgs): string {
	const logsService = `logs.${region}.amazonaws.com`;
	const encryptionContextCondition = {
		ArnEquals: {
			"kms:EncryptionContext:aws:logs:arn": logGroupArns,
		},
	};

	return JSON.stringify({
		Version: "2012-10-17",
		Statement: [
			{
				Sid: "EnableAccountIAMPolicies",
				Effect: "Allow",
				Principal: { AWS: `arn:aws:iam::${accountId}:root` },
				Action: "kms:*",
				Resource: "*",
			},
			{
				Sid: "AllowCloudWatchLogsEncryption",
				Effect: "Allow",
				Principal: { Service: logsService },
				Action: CLOUDWATCH_LOGS_KEY_ACTIONS,
				Resource: "*",
				Condition: encryptionContextCondition,
			},
			{
				Sid: "AllowApprovedCallersThroughCloudWatchLogs",
				Effect: "Allow",
				Principal: { AWS: callerArns },
				Action: CLOUDWATCH_LOGS_KEY_ACTIONS,
				Resource: "*",
				Condition: {
					...encryptionContextCondition,
					StringEquals: { "kms:ViaService": logsService },
				},
			},
		],
	});
}
