import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { DeploymentConfig } from "./config";
import {
	APPLICATION_SECRET_KEYS,
	type ApplicationSecretKey,
	CONTAINER_SECRET_KEYS,
} from "./container-secrets";
import type { DataLayer } from "./data";
import { buildCloudWatchLogsKeyPolicy } from "./logging-key-policy";
import type { Network } from "./network";

interface ComputeLayer {
	alb: aws.lb.LoadBalancer;
	cluster: aws.ecs.Cluster;
	migrationTaskDefinition: aws.ecs.TaskDefinition;
}

interface ContainerDefinition {
	capabilities?: { add?: string[]; drop: string[] };
	command?: string[];
	cpu?: number;
	dependsOn?: Array<{ condition: string; containerName: string }>;
	environment?: Array<{ name: string; value: string }>;
	essential: boolean;
	healthCheck?: {
		command: string[];
		interval: number;
		retries: number;
		startPeriod: number;
		timeout: number;
	};
	image: string;
	linuxParameters?: {
		capabilities: { add?: string[]; drop: string[] };
		initProcessEnabled: boolean;
	};
	logConfiguration: {
		logDriver: string;
		options: Record<string, string>;
	};
	memoryReservation?: number;
	name: string;
	portMappings?: Array<{
		containerPort: number;
		hostPort: number;
		name: string;
		protocol: string;
	}>;
	readonlyRootFilesystem: boolean;
	secrets?: Array<{ name: string; valueFrom: string }>;
	user?: string;
}

const assumeRolePolicy = JSON.stringify({
	Version: "2012-10-17",
	Statement: [
		{
			Action: "sts:AssumeRole",
			Effect: "Allow",
			Principal: { Service: "ecs-tasks.amazonaws.com" },
		},
	],
});

function requiredValue<T>(value: T | undefined, label: string): T {
	if (value === undefined) throw new Error(`${label} did not resolve`);
	return value;
}

function logging(
	logGroupName: string,
	region: string,
	streamPrefix: string,
): ContainerDefinition["logConfiguration"] {
	return {
		logDriver: "awslogs",
		options: {
			"awslogs-group": logGroupName,
			"awslogs-region": region,
			"awslogs-stream-prefix": streamPrefix,
		},
	};
}

export function createComputeLayer(
	name: string,
	config: DeploymentConfig,
	network: Network,
	data: DataLayer,
): ComputeLayer {
	const region = aws.config.region;
	if (!region) throw new Error("aws:region must be configured");
	const publicOrigin = `https://${config.domainName}`;
	const alarmActions = config.alarmTopicArn ? [config.alarmTopicArn] : [];
	const executionRole = new aws.iam.Role(`${name}-execution-role`, {
		assumeRolePolicy,
	});
	const logGroupArns = ["application", "electric", "migration"].map(
		(suffix) =>
			`arn:aws:logs:${region}:${config.awsAccountId}:log-group:/superset/${name}/${suffix}`,
	);

	const logKey = new aws.kms.Key(`${name}-logs-key`, {
		description: "Superset CloudWatch log encryption",
		enableKeyRotation: true,
		deletionWindowInDays: 30,
		policy: executionRole.arn.apply((callerArn) =>
			buildCloudWatchLogsKeyPolicy({
				accountId: config.awsAccountId,
				callerArns: [callerArn],
				logGroupArns,
				region,
			}),
		),
	});
	const appLogGroup = new aws.cloudwatch.LogGroup(`${name}-app-logs`, {
		kmsKeyId: logKey.arn,
		name: `/superset/${name}/application`,
		retentionInDays: config.logRetentionDays,
	});
	const electricLogGroup = new aws.cloudwatch.LogGroup(
		`${name}-electric-logs`,
		{
			kmsKeyId: logKey.arn,
			name: `/superset/${name}/electric`,
			retentionInDays: config.logRetentionDays,
		},
	);
	const migrationLogGroup = new aws.cloudwatch.LogGroup(
		`${name}-migration-logs`,
		{
			kmsKeyId: logKey.arn,
			name: `/superset/${name}/migration`,
			retentionInDays: config.logRetentionDays,
		},
	);

	new aws.iam.RolePolicyAttachment(`${name}-execution-policy`, {
		policyArn:
			"arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
		role: executionRole.name,
	});
	new aws.iam.RolePolicy(`${name}-execution-secrets`, {
		policy: pulumi
			.all([data.credentialsSecret.arn, data.kmsKey.arn])
			.apply(([secretArn, keyArn]) =>
				JSON.stringify({
					Version: "2012-10-17",
					Statement: [
						{
							Action: ["secretsmanager:GetSecretValue"],
							Effect: "Allow",
							Resource: secretArn,
						},
						{
							Action: ["kms:Decrypt"],
							Effect: "Allow",
							Resource: keyArn,
						},
					],
				}),
			),
		role: executionRole.id,
	});
	const taskRole = new aws.iam.Role(`${name}-task-role`, { assumeRolePolicy });

	const cluster = new aws.ecs.Cluster(`${name}-cluster`, {
		settings: [{ name: "containerInsights", value: "enabled" }],
	});

	const logBucket = new aws.s3.Bucket(`${name}-access-logs`, {
		forceDestroy: false,
	});
	new aws.s3.BucketOwnershipControls(`${name}-access-log-ownership`, {
		bucket: logBucket.id,
		rule: { objectOwnership: "BucketOwnerEnforced" },
	});
	new aws.s3.BucketPublicAccessBlock(`${name}-access-log-public-block`, {
		blockPublicAcls: true,
		blockPublicPolicy: true,
		bucket: logBucket.id,
		ignorePublicAcls: true,
		restrictPublicBuckets: true,
	});
	new aws.s3.BucketServerSideEncryptionConfiguration(
		`${name}-access-log-encryption`,
		{
			bucket: logBucket.id,
			rules: [
				{ applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" } },
			],
		},
	);
	new aws.s3.BucketLifecycleConfiguration(`${name}-access-log-lifecycle`, {
		bucket: logBucket.id,
		rules: [
			{
				expiration: { days: 365 },
				filter: { prefix: "" },
				id: "retention",
				status: "Enabled",
			},
		],
	});
	const accessLogBucketPolicy = new aws.s3.BucketPolicy(
		`${name}-access-log-policy`,
		{
			bucket: logBucket.id,
			policy: logBucket.arn.apply((bucketArn) =>
				JSON.stringify({
					Version: "2012-10-17",
					Statement: [
						{
							Action: "s3:PutObject",
							Effect: "Allow",
							Principal: {
								Service: "logdelivery.elasticloadbalancing.amazonaws.com",
							},
							Condition: {
								StringEquals: {
									"aws:SourceAccount": config.awsAccountId,
								},
								ArnLike: {
									"aws:SourceArn": `arn:aws:elasticloadbalancing:${region}:${config.awsAccountId}:loadbalancer/app/*`,
								},
							},
							Resource: `${bucketArn}/AWSLogs/${config.awsAccountId}/*`,
						},
					],
				}),
			),
		},
	);

	const alb = new aws.lb.LoadBalancer(
		`${name}-alb`,
		{
			accessLogs: { bucket: logBucket.bucket, enabled: true },
			dropInvalidHeaderFields: true,
			enableDeletionProtection: true,
			enableHttp2: true,
			idleTimeout: 300,
			internal: false,
			loadBalancerType: "application",
			securityGroups: [network.albSecurityGroupId],
			subnets: network.publicSubnetIds,
		},
		{ dependsOn: [logBucket, accessLogBucketPolicy] },
	);
	const targetGroup = (suffix: string, port: number, healthPath: string) =>
		new aws.lb.TargetGroup(`${name}-${suffix}-tg`, {
			name: `${name.slice(0, 20)}-${suffix.slice(0, 10)}`,
			deregistrationDelay: 30,
			healthCheck: {
				enabled: true,
				healthyThreshold: 2,
				interval: 30,
				matcher: "200-399",
				path: healthPath,
				timeout: 10,
				unhealthyThreshold: 3,
			},
			port,
			protocol: "HTTP",
			targetType: "ip",
			vpcId: network.vpcId,
		});
	const webTarget = targetGroup("web", 3000, "/sign-in");
	const apiTarget = targetGroup("api", 3001, "/api/auth/get-session");
	const proxyTarget = targetGroup("electric-proxy", 8787, "/_health");
	const httpsListener = new aws.lb.Listener(`${name}-https`, {
		certificateArn: config.certificateArn,
		defaultActions: [{ targetGroupArn: webTarget.arn, type: "forward" }],
		loadBalancerArn: alb.arn,
		port: 443,
		protocol: "HTTPS",
		sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
	});
	new aws.lb.Listener(`${name}-http`, {
		defaultActions: [
			{
				redirect: { port: "443", protocol: "HTTPS", statusCode: "HTTP_301" },
				type: "redirect",
			},
		],
		loadBalancerArn: alb.arn,
		port: 80,
		protocol: "HTTP",
	});
	new aws.lb.ListenerRule(`${name}-electric-rule`, {
		actions: [{ targetGroupArn: proxyTarget.arn, type: "forward" }],
		conditions: [{ pathPattern: { values: ["/v1/shape*"] } }],
		listenerArn: httpsListener.arn,
		priority: 10,
	});
	new aws.lb.ListenerRule(`${name}-api-rule`, {
		actions: [{ targetGroupArn: apiTarget.arn, type: "forward" }],
		conditions: [{ pathPattern: { values: ["/api/*"] } }],
		listenerArn: httpsListener.arn,
		priority: 20,
	});

	if (config.hostedZoneId) {
		new aws.route53.Record(`${name}-dns`, {
			aliases: [
				{
					evaluateTargetHealth: true,
					name: alb.dnsName,
					zoneId: alb.zoneId,
				},
			],
			name: config.domainName,
			type: "A",
			zoneId: config.hostedZoneId,
		});
	}

	const namespace = new aws.servicediscovery.PrivateDnsNamespace(
		`${name}-namespace`,
		{
			name: `${name}.internal`,
			vpc: network.vpcId,
		},
	);
	const electricDiscovery = new aws.servicediscovery.Service(
		`${name}-electric-discovery`,
		{
			dnsConfig: {
				dnsRecords: [{ ttl: 10, type: "A" }],
				namespaceId: namespace.id,
				routingPolicy: "MULTIVALUE",
			},
			healthCheckCustomConfig: {},
			name: "electric",
		},
	);

	const secret = (key: string) =>
		pulumi.interpolate`${data.credentialsSecret.arn}:${key}::`;
	const commonEnvironment = [
		{ name: "NODE_ENV", value: "production" },
		{ name: "SUPERSET_LOCAL_MODE", value: "true" },
		{ name: "NEXT_PUBLIC_SUPERSET_LOCAL_MODE", value: "true" },
		{ name: "SUPERSET_HIPAA_MODE", value: "true" },
		{ name: "SUPERSET_CLOUD_DISABLED", value: "true" },
		{ name: "SUPERSET_RELAY_DISABLED", value: "true" },
		{ name: "SUPERSET_TELEMETRY_DISABLED", value: "true" },
		{ name: "SUPERSET_AUTO_UPDATE_DISABLED", value: "true" },
		{ name: "SUPERSET_HOSTED_INTEGRATIONS_DISABLED", value: "true" },
		{ name: "DO_NOT_TRACK", value: "1" },
		{ name: "NEXT_TELEMETRY_DISABLED", value: "1" },
		{ name: "TURBO_TELEMETRY_DISABLED", value: "1" },
		{ name: "NEXT_PUBLIC_API_URL", value: publicOrigin },
		{ name: "NEXT_PUBLIC_WEB_URL", value: publicOrigin },
		{ name: "NEXT_PUBLIC_ADMIN_URL", value: publicOrigin },
		{ name: "NEXT_PUBLIC_DESKTOP_URL", value: publicOrigin },
		{ name: "NEXT_PUBLIC_MARKETING_URL", value: publicOrigin },
		{ name: "NEXT_PUBLIC_DOCS_URL", value: publicOrigin },
		{ name: "NEXT_PUBLIC_ELECTRIC_URL", value: publicOrigin },
		{ name: "NEXT_PUBLIC_STREAMS_URL", value: publicOrigin },
		{ name: "NEXT_PUBLIC_COOKIE_DOMAIN", value: config.domainName },
		{ name: "SUPERSET_INTERNAL_API_URL", value: "http://127.0.0.1:3001" },
		{ name: "KV_REST_API_URL", value: "http://127.0.0.1:80" },
		{
			name: "AUTH_JWKS_URL",
			value: "http://127.0.0.1:3001/api/auth/jwks",
		},
		{ name: "AUTH_JWT_AUDIENCE", value: publicOrigin },
		{ name: "AUTH_JWT_ISSUER", value: publicOrigin },
		{
			name: "ELECTRIC_ALLOWED_ORIGIN",
			value: `${publicOrigin},superset-app://renderer`,
		},
		{
			name: "ELECTRIC_SHAPE_URL",
			value: `http://electric.${name}.internal:3000/v1/shape`,
		},
		{ name: "PORT", value: "8787" },
		{ name: "NEXT_PUBLIC_RELAY_URL", value: "http://127.0.0.1:9" },
		{ name: "RELAY_URL", value: "http://127.0.0.1:9" },
		{ name: "STREAMS_URL", value: publicOrigin },
		{ name: "DURABLE_STREAMS_URL", value: "http://127.0.0.1:9" },
		{ name: "DURABLE_STREAMS_SECRET", value: "local-disabled" },
		{ name: "NEXT_PUBLIC_POSTHOG_KEY", value: "phc_local_disabled" },
		{ name: "NEXT_PUBLIC_POSTHOG_HOST", value: "http://127.0.0.1:9" },
		{ name: "POSTHOG_API_KEY", value: "local-disabled" },
		{ name: "POSTHOG_API_HOST", value: "http://127.0.0.1:9" },
		{ name: "POSTHOG_PROJECT_ID", value: "0" },
		{ name: "GOOGLE_CLIENT_ID", value: "local-disabled" },
		{ name: "GOOGLE_CLIENT_SECRET", value: "local-disabled" },
		{ name: "GH_CLIENT_ID", value: "local-disabled" },
		{ name: "GH_CLIENT_SECRET", value: "local-disabled" },
		{ name: "GH_APP_ID", value: "0" },
		{ name: "GH_APP_PRIVATE_KEY", value: "local-disabled" },
		{ name: "GH_WEBHOOK_SECRET", value: "local-disabled" },
		{ name: "LINEAR_CLIENT_ID", value: "local-disabled" },
		{ name: "LINEAR_CLIENT_SECRET", value: "local-disabled" },
		{ name: "LINEAR_WEBHOOK_SECRET", value: "local-disabled" },
		{ name: "SLACK_CLIENT_ID", value: "local-disabled" },
		{ name: "SLACK_CLIENT_SECRET", value: "local-disabled" },
		{ name: "SLACK_SIGNING_SECRET", value: "local-disabled" },
		{ name: "SLACK_BILLING_WEBHOOK_URL", value: "http://127.0.0.1:9" },
		{ name: "ANTHROPIC_API_KEY", value: "local-disabled" },
		{ name: "BLOB_READ_WRITE_TOKEN", value: "local-disabled" },
		{ name: "RESEND_API_KEY", value: "local-disabled" },
		{ name: "STRIPE_SECRET_KEY", value: "sk_test_local_disabled" },
		{ name: "STRIPE_WEBHOOK_SECRET", value: "whsec_local_disabled" },
		{ name: "STRIPE_PRO_MONTHLY_PRICE_ID", value: "price_local_disabled" },
		{ name: "STRIPE_PRO_YEARLY_PRICE_ID", value: "price_local_disabled" },
		{
			name: "STRIPE_ENTERPRISE_YEARLY_PRICE_ID",
			value: "price_local_disabled",
		},
		{ name: "QSTASH_TOKEN", value: "local-disabled" },
		{ name: "QSTASH_URL", value: "http://127.0.0.1:9" },
		{ name: "QSTASH_CURRENT_SIGNING_KEY", value: "local-disabled" },
		{ name: "QSTASH_NEXT_SIGNING_KEY", value: "local-disabled" },
	] satisfies Array<{ name: string; value: string }>;

	const appDefinitions = pulumi
		.all([
			appLogGroup.name,
			...APPLICATION_SECRET_KEYS.map(secret),
			secret("REDIS_URL"),
		])
		.apply(([logGroupName, ...secretValues]) => {
			const secretValuesByKey = Object.fromEntries(
				APPLICATION_SECRET_KEYS.map((key, index) => [
					key,
					requiredValue(secretValues[index], key),
				]),
			) as Record<ApplicationSecretKey, string>;
			const secretsFor = (
				keys: readonly ApplicationSecretKey[],
			): ContainerDefinition["secrets"] =>
				keys.map((key) => ({ name: key, valueFrom: secretValuesByKey[key] }));
			const redisUrl = requiredValue(
				secretValues[APPLICATION_SECRET_KEYS.length],
				"REDIS_URL",
			);
			const resolvedLogGroupName = requiredValue(
				logGroupName,
				"application log group",
			);
			const appContainer = (
				containerName: string,
				port: number,
				command: string[],
				healthUrl: string,
				containerSecrets: ContainerDefinition["secrets"],
			): ContainerDefinition => ({
				command,
				cpu: containerName === "electric-proxy" ? 128 : 256,
				dependsOn: [{ condition: "START", containerName: "redis-http" }],
				environment: commonEnvironment,
				essential: true,
				healthCheck: {
					command: [
						"CMD-SHELL",
						`bun -e "fetch('${healthUrl}').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"`,
					],
					interval: 30,
					retries: 3,
					startPeriod: 60,
					timeout: 10,
				},
				image: config.appImage,
				linuxParameters: {
					capabilities: { drop: ["ALL"] },
					initProcessEnabled: true,
				},
				logConfiguration: logging(resolvedLogGroupName, region, containerName),
				memoryReservation: containerName === "electric-proxy" ? 256 : 512,
				name: containerName,
				portMappings: [
					{
						containerPort: port,
						hostPort: port,
						name: containerName,
						protocol: "tcp",
					},
				],
				readonlyRootFilesystem: false,
				secrets: containerSecrets,
				user: "1000:1000",
			});

			return JSON.stringify([
				appContainer(
					"api",
					3001,
					["bun", "run", "--cwd", "apps/api", "start"],
					"http://127.0.0.1:3001/api/auth/get-session",
					secretsFor(CONTAINER_SECRET_KEYS.api),
				),
				appContainer(
					"web",
					3000,
					["bun", "run", "--cwd", "apps/web", "start"],
					"http://127.0.0.1:3000/sign-in",
					secretsFor(CONTAINER_SECRET_KEYS.web),
				),
				appContainer(
					"electric-proxy",
					8787,
					["bun", "run", "--cwd", "apps/electric-proxy", "start:server"],
					"http://127.0.0.1:8787/_health",
					secretsFor(CONTAINER_SECRET_KEYS["electric-proxy"]),
				),
				{
					cpu: 128,
					environment: [{ name: "SRH_MODE", value: "env" }],
					essential: true,
					image: config.redisHttpImage,
					linuxParameters: {
						capabilities: { add: ["NET_BIND_SERVICE"], drop: ["ALL"] },
						initProcessEnabled: true,
					},
					logConfiguration: logging(resolvedLogGroupName, region, "redis-http"),
					memoryReservation: 128,
					name: "redis-http",
					portMappings: [
						{
							containerPort: 80,
							hostPort: 80,
							name: "redis-http",
							protocol: "tcp",
						},
					],
					readonlyRootFilesystem: false,
					secrets: [
						{ name: "SRH_CONNECTION_STRING", valueFrom: redisUrl },
						{
							name: "SRH_TOKEN",
							valueFrom: secretValuesByKey.KV_REST_API_TOKEN,
						},
					],
				} satisfies ContainerDefinition,
			]);
		});
	const appTaskDefinition = new aws.ecs.TaskDefinition(`${name}-app-task`, {
		containerDefinitions: appDefinitions,
		cpu: "1024",
		executionRoleArn: executionRole.arn,
		family: `${name}-application`,
		memory: "2048",
		networkMode: "awsvpc",
		requiresCompatibilities: ["FARGATE"],
		runtimePlatform: {
			cpuArchitecture: "ARM64",
			operatingSystemFamily: "LINUX",
		},
		taskRoleArn: taskRole.arn,
	});

	const electricDefinitions = pulumi
		.all([
			electricLogGroup.name,
			secret("DATABASE_URL"),
			secret("ELECTRIC_SECRET"),
		])
		.apply(([logGroupName, databaseUrl, electricSecret]) =>
			JSON.stringify([
				{
					environment: [{ name: "DATABASE_USE_IPV6", value: "false" }],
					essential: true,
					image: config.electricImage,
					linuxParameters: {
						capabilities: { drop: ["ALL"] },
						initProcessEnabled: true,
					},
					logConfiguration: logging(logGroupName, region, "electric"),
					name: "electric",
					portMappings: [
						{
							containerPort: 3000,
							hostPort: 3000,
							name: "electric",
							protocol: "tcp",
						},
					],
					readonlyRootFilesystem: false,
					secrets: [
						{ name: "DATABASE_URL", valueFrom: databaseUrl },
						{ name: "ELECTRIC_SECRET", valueFrom: electricSecret },
					],
				} satisfies ContainerDefinition,
			]),
		);
	const electricTaskDefinition = new aws.ecs.TaskDefinition(
		`${name}-electric-task`,
		{
			containerDefinitions: electricDefinitions,
			cpu: "256",
			executionRoleArn: executionRole.arn,
			family: `${name}-electric`,
			memory: "512",
			networkMode: "awsvpc",
			requiresCompatibilities: ["FARGATE"],
			runtimePlatform: {
				cpuArchitecture: "ARM64",
				operatingSystemFamily: "LINUX",
			},
			taskRoleArn: taskRole.arn,
		},
	);
	const electricService = new aws.ecs.Service(`${name}-electric-service`, {
		cluster: cluster.arn,
		deploymentCircuitBreaker: { enable: true, rollback: true },
		desiredCount: 1,
		enableEcsManagedTags: true,
		launchType: "FARGATE",
		networkConfiguration: {
			assignPublicIp: true,
			securityGroups: [network.electricSecurityGroupId],
			subnets: network.publicSubnetIds,
		},
		serviceRegistries: { registryArn: electricDiscovery.arn },
		taskDefinition: electricTaskDefinition.arn,
		waitForSteadyState: false,
	});

	new aws.ecs.Service(
		`${name}-app-service`,
		{
			cluster: cluster.arn,
			deploymentCircuitBreaker: { enable: true, rollback: true },
			desiredCount: config.highAvailability ? 2 : 1,
			enableEcsManagedTags: true,
			healthCheckGracePeriodSeconds: 120,
			launchType: "FARGATE",
			loadBalancers: [
				{
					containerName: "web",
					containerPort: 3000,
					targetGroupArn: webTarget.arn,
				},
				{
					containerName: "api",
					containerPort: 3001,
					targetGroupArn: apiTarget.arn,
				},
				{
					containerName: "electric-proxy",
					containerPort: 8787,
					targetGroupArn: proxyTarget.arn,
				},
			],
			networkConfiguration: {
				assignPublicIp: true,
				securityGroups: [network.appSecurityGroupId],
				subnets: network.publicSubnetIds,
			},
			taskDefinition: appTaskDefinition.arn,
			waitForSteadyState: false,
		},
		{ dependsOn: [httpsListener, electricService] },
	);

	const migrationDefinitions = pulumi
		.all([
			migrationLogGroup.name,
			...CONTAINER_SECRET_KEYS.migration.map(secret),
			secret("SUP_LOCAL_ADMIN_PASSWORD"),
		])
		.apply(([logGroupName, ...secretValues]) => {
			const resolvedLogGroupName = requiredValue(
				logGroupName,
				"migration log group",
			);
			return JSON.stringify([
				{
					command: ["sh", "appliance/scripts/container-init.sh"],
					environment: [
						...commonEnvironment,
						{ name: "SUP_LOCAL_ADMIN_EMAIL", value: config.adminEmail },
						{ name: "SUP_LOCAL_ADMIN_NAME", value: "Local Administrator" },
					],
					essential: true,
					image: config.appImage,
					linuxParameters: {
						capabilities: { drop: ["ALL"] },
						initProcessEnabled: true,
					},
					logConfiguration: logging(resolvedLogGroupName, region, "migration"),
					name: "migration",
					readonlyRootFilesystem: false,
					secrets: [
						...CONTAINER_SECRET_KEYS.migration.map((key, index) => ({
							name: key,
							valueFrom: requiredValue(secretValues[index], key),
						})),
						{
							name: "SUP_LOCAL_ADMIN_PASSWORD",
							valueFrom: requiredValue(
								secretValues[CONTAINER_SECRET_KEYS.migration.length],
								"SUP_LOCAL_ADMIN_PASSWORD",
							),
						},
					],
					user: "1000:1000",
				} satisfies ContainerDefinition,
			]);
		});
	const migrationTaskDefinition = new aws.ecs.TaskDefinition(
		`${name}-migration-task`,
		{
			containerDefinitions: migrationDefinitions,
			cpu: "512",
			executionRoleArn: executionRole.arn,
			family: `${name}-migration`,
			memory: "1024",
			networkMode: "awsvpc",
			requiresCompatibilities: ["FARGATE"],
			runtimePlatform: {
				cpuArchitecture: "ARM64",
				operatingSystemFamily: "LINUX",
			},
			taskRoleArn: taskRole.arn,
		},
	);

	new aws.cloudwatch.MetricAlarm(`${name}-database-storage-alarm`, {
		alarmActions,
		alarmDescription: "RDS free storage is below 5 GiB",
		comparisonOperator: "LessThanThreshold",
		dimensions: { DBInstanceIdentifier: data.database.identifier },
		evaluationPeriods: 2,
		metricName: "FreeStorageSpace",
		namespace: "AWS/RDS",
		period: 300,
		statistic: "Average",
		threshold: 5 * 1024 * 1024 * 1024,
		treatMissingData: "breaching",
	});
	const monitoredTargetGroups = [
		{ label: "web", resourceSuffix: "web", targetGroup: webTarget },
		{ label: "api", resourceSuffix: "api", targetGroup: apiTarget },
		{
			label: "electric proxy",
			resourceSuffix: "electric-proxy",
			targetGroup: proxyTarget,
		},
	] as const;
	for (const { label, resourceSuffix, targetGroup } of monitoredTargetGroups) {
		new aws.cloudwatch.MetricAlarm(
			`${name}-${resourceSuffix}-unhealthy-target-alarm`,
			{
				alarmActions,
				alarmDescription: `One or more ${label} targets are unhealthy`,
				comparisonOperator: "GreaterThanThreshold",
				datapointsToAlarm: 2,
				dimensions: {
					LoadBalancer: alb.arnSuffix,
					TargetGroup: targetGroup.arnSuffix,
				},
				evaluationPeriods: 2,
				metricName: "UnHealthyHostCount",
				namespace: "AWS/ApplicationELB",
				period: 60,
				statistic: "Maximum",
				threshold: 0,
				treatMissingData: "breaching",
			},
		);
		new aws.cloudwatch.MetricAlarm(
			`${name}-${resourceSuffix}-target-5xx-alarm`,
			{
				alarmActions,
				alarmDescription: `${label} targets are returning 5xx responses`,
				comparisonOperator: "GreaterThanThreshold",
				datapointsToAlarm: 2,
				dimensions: {
					LoadBalancer: alb.arnSuffix,
					TargetGroup: targetGroup.arnSuffix,
				},
				evaluationPeriods: 2,
				metricName: "HTTPCode_Target_5XX_Count",
				namespace: "AWS/ApplicationELB",
				period: 60,
				statistic: "Sum",
				threshold: 5,
				treatMissingData: "notBreaching",
			},
		);
	}
	new aws.cloudwatch.MetricAlarm(`${name}-alb-5xx-alarm`, {
		alarmActions,
		alarmDescription:
			"Application load balancer is generating 5xx responses before reaching a target",
		comparisonOperator: "GreaterThanThreshold",
		datapointsToAlarm: 2,
		dimensions: { LoadBalancer: alb.arnSuffix },
		evaluationPeriods: 2,
		metricName: "HTTPCode_ELB_5XX_Count",
		namespace: "AWS/ApplicationELB",
		period: 60,
		statistic: "Sum",
		threshold: 5,
		treatMissingData: "notBreaching",
	});
	new aws.cloudwatch.MetricAlarm(
		`${name}-electric-service-availability-alarm`,
		{
			alarmActions,
			alarmDescription: "The Electric ECS service has no running task",
			comparisonOperator: "LessThanThreshold",
			datapointsToAlarm: 2,
			dimensions: {
				ClusterName: cluster.name,
				ServiceName: electricService.name,
			},
			evaluationPeriods: 2,
			metricName: "RunningTaskCount",
			namespace: "ECS/ContainerInsights",
			period: 60,
			statistic: "Minimum",
			threshold: 1,
			treatMissingData: "breaching",
		},
	);

	return { alb, cluster, migrationTaskDefinition };
}
