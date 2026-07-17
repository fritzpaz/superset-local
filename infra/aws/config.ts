import * as pulumi from "@pulumi/pulumi";

export interface DeploymentConfig {
	adminEmail: string;
	alarmTopicArn?: string;
	appImage: string;
	awsAccountId: string;
	availabilityZones: [string, string];
	backupRetentionDays: number;
	certificateArn: string;
	dbAllocatedStorageGb: number;
	dbInstanceClass: string;
	domainName: string;
	electricImage: string;
	enforceImageDigests: boolean;
	highAvailability: boolean;
	hostedZoneId?: string;
	logRetentionDays: number;
	redisHttpImage: string;
	stackName: string;
}

export function assertDigestImage(name: string, image: string): void {
	if (!image.includes("@sha256:")) {
		throw new Error(
			`${name} must be an immutable image reference containing @sha256:`,
		);
	}
}

function requiredElement<T>(value: T | undefined, label: string): T {
	if (value === undefined) throw new Error(`${label} is required`);
	return value;
}

export function loadConfig(): DeploymentConfig {
	const config = new pulumi.Config();
	const availabilityZones = config.requireObject<string[]>("availabilityZones");
	if (availabilityZones.length !== 2 || new Set(availabilityZones).size !== 2) {
		throw new Error(
			"availabilityZones must contain exactly two distinct zones",
		);
	}

	const domainName = config.require("domainName").toLowerCase();
	if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domainName)) {
		throw new Error("domainName must be a DNS hostname without a URL scheme");
	}

	const result: DeploymentConfig = {
		adminEmail: config.get("adminEmail") ?? `admin@${domainName}`,
		alarmTopicArn: config.get("alarmTopicArn"),
		appImage: config.require("appImage"),
		awsAccountId: config.require("awsAccountId"),
		availabilityZones: [
			requiredElement(availabilityZones[0], "first availability zone"),
			requiredElement(availabilityZones[1], "second availability zone"),
		],
		backupRetentionDays: config.getNumber("backupRetentionDays") ?? 7,
		certificateArn: config.require("certificateArn"),
		dbAllocatedStorageGb: config.getNumber("dbAllocatedStorageGb") ?? 20,
		dbInstanceClass: config.get("dbInstanceClass") ?? "db.t4g.micro",
		domainName,
		electricImage: config.require("electricImage"),
		enforceImageDigests: config.getBoolean("enforceImageDigests") ?? true,
		highAvailability: config.getBoolean("highAvailability") ?? false,
		hostedZoneId: config.get("hostedZoneId"),
		logRetentionDays: config.getNumber("logRetentionDays") ?? 30,
		redisHttpImage: config.require("redisHttpImage"),
		stackName: pulumi.getStack(),
	};

	if (result.backupRetentionDays < 7 || result.backupRetentionDays > 35) {
		throw new Error("backupRetentionDays must be from 7 through 35");
	}
	if (!/^\d{12}$/.test(result.awsAccountId)) {
		throw new Error("awsAccountId must be the 12-digit deployment account ID");
	}
	if (result.logRetentionDays < 30) {
		throw new Error("logRetentionDays must be at least 30");
	}
	if (result.dbAllocatedStorageGb < 20) {
		throw new Error("dbAllocatedStorageGb must be at least 20");
	}
	if (result.enforceImageDigests) {
		assertDigestImage("appImage", result.appImage);
		assertDigestImage("electricImage", result.electricImage);
		assertDigestImage("redisHttpImage", result.redisHttpImage);
	}

	return result;
}
