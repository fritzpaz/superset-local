import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import type { DeploymentConfig } from "./config";
import type { Network } from "./network";

export interface DataLayer {
	cache: aws.elasticache.ReplicationGroup;
	credentialsSecret: aws.secretsmanager.Secret;
	database: aws.rds.Instance;
	kmsKey: aws.kms.Key;
}

export function createDataLayer(
	name: string,
	config: DeploymentConfig,
	network: Network,
): DataLayer {
	const kmsKey = new aws.kms.Key(`${name}-data-key`, {
		description: "Superset application data and secret encryption",
		enableKeyRotation: true,
		deletionWindowInDays: 30,
	});
	new aws.kms.Alias(`${name}-data-key-alias`, {
		name: `alias/${name}-data`,
		targetKeyId: kmsKey.keyId,
	});

	const databasePassword = new random.RandomPassword(
		`${name}-database-password`,
		{
			length: 40,
			special: false,
		},
	);
	const redisPassword = new random.RandomPassword(`${name}-redis-password`, {
		length: 40,
		special: false,
	});
	const authSecret = new random.RandomPassword(`${name}-auth-secret`, {
		length: 48,
		special: false,
	});
	const encryptionKey = new random.RandomBytes(`${name}-secrets-key`, {
		length: 32,
	});
	const electricSecret = new random.RandomPassword(`${name}-electric-secret`, {
		length: 48,
		special: false,
	});
	const adminPassword = new random.RandomPassword(`${name}-admin-password`, {
		length: 32,
		special: false,
	});

	const databaseSubnetGroup = new aws.rds.SubnetGroup(
		`${name}-database-subnets`,
		{
			subnetIds: network.privateSubnetIds,
		},
	);
	const parameterGroup = new aws.rds.ParameterGroup(`${name}-postgres-params`, {
		family: "postgres17",
		parameters: [
			{
				applyMethod: "pending-reboot",
				name: "rds.logical_replication",
				value: "1",
			},
			{
				applyMethod: "pending-reboot",
				name: "max_replication_slots",
				value: "10",
			},
			{ applyMethod: "pending-reboot", name: "max_wal_senders", value: "10" },
			{ applyMethod: "immediate", name: "log_connections", value: "1" },
			{ applyMethod: "immediate", name: "log_disconnections", value: "1" },
		],
	});
	const database = new aws.rds.Instance(
		`${name}-database`,
		{
			allocatedStorage: config.dbAllocatedStorageGb,
			autoMinorVersionUpgrade: true,
			backupRetentionPeriod: config.backupRetentionDays,
			backupWindow: "03:00-04:00",
			copyTagsToSnapshot: true,
			dbName: "superset",
			dbSubnetGroupName: databaseSubnetGroup.name,
			deleteAutomatedBackups: false,
			deletionProtection: true,
			enabledCloudwatchLogsExports: ["postgresql", "upgrade"],
			engine: "postgres",
			engineVersion: "17.4",
			finalSnapshotIdentifier: `${name}-final`,
			identifier: name,
			instanceClass: config.dbInstanceClass,
			iamDatabaseAuthenticationEnabled: true,
			kmsKeyId: kmsKey.arn,
			maintenanceWindow: "sun:05:00-sun:06:00",
			maxAllocatedStorage: Math.max(config.dbAllocatedStorageGb * 5, 100),
			multiAz: config.highAvailability,
			parameterGroupName: parameterGroup.name,
			password: databasePassword.result,
			port: 5432,
			publiclyAccessible: false,
			skipFinalSnapshot: false,
			storageEncrypted: true,
			storageType: "gp3",
			username: "superset_admin",
			vpcSecurityGroupIds: [network.databaseSecurityGroupId],
		},
		{ protect: true },
	);

	const cacheSubnetGroup = new aws.elasticache.SubnetGroup(
		`${name}-cache-subnets`,
		{ subnetIds: network.privateSubnetIds },
	);
	const cache = new aws.elasticache.ReplicationGroup(
		`${name}-cache`,
		{
			applyImmediately: false,
			atRestEncryptionEnabled: true,
			authToken: redisPassword.result,
			automaticFailoverEnabled: config.highAvailability,
			description: "Superset rate-limit and ephemeral cache data",
			engine: "redis",
			engineVersion: "7.1",
			kmsKeyId: kmsKey.arn,
			maintenanceWindow: "sun:06:00-sun:07:00",
			multiAzEnabled: config.highAvailability,
			nodeType: "cache.t4g.micro",
			numCacheClusters: config.highAvailability ? 2 : 1,
			port: 6379,
			snapshotRetentionLimit: config.backupRetentionDays,
			snapshotWindow: "04:00-05:00",
			subnetGroupName: cacheSubnetGroup.name,
			transitEncryptionEnabled: true,
			transitEncryptionMode: "required",
			securityGroupIds: [network.cacheSecurityGroupId],
		},
		{ protect: true },
	);

	const credentialsSecret = new aws.secretsmanager.Secret(
		`${name}-runtime-secret`,
		{
			description: "Generated Superset runtime credentials",
			kmsKeyId: kmsKey.arn,
			recoveryWindowInDays: 30,
		},
		{ protect: true },
	);
	const databaseUrl = pulumi.interpolate`postgresql://superset_admin:${databasePassword.result}@${database.address}:5432/superset?sslmode=require`;
	const redisUrl = pulumi.interpolate`rediss://:${redisPassword.result}@${cache.primaryEndpointAddress}:6379/0`;
	new aws.secretsmanager.SecretVersion(`${name}-runtime-secret-version`, {
		secretId: credentialsSecret.id,
		secretString: pulumi.jsonStringify({
			BETTER_AUTH_SECRET: authSecret.result,
			DATABASE_URL: databaseUrl,
			DATABASE_URL_UNPOOLED: databaseUrl,
			ELECTRIC_SECRET: electricSecret.result,
			KV_REST_API_TOKEN: redisPassword.result,
			KV_URL: redisUrl,
			REDIS_URL: redisUrl,
			SECRETS_ENCRYPTION_KEY: encryptionKey.base64,
			SUP_LOCAL_ADMIN_PASSWORD: adminPassword.result,
		}),
	});

	return { cache, credentialsSecret, database, kmsKey };
}
