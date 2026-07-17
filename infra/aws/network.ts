import * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { DeploymentConfig } from "./config";

export interface Network {
	albSecurityGroupId: pulumi.Output<string>;
	appSecurityGroupId: pulumi.Output<string>;
	cacheSecurityGroupId: pulumi.Output<string>;
	databaseSecurityGroupId: pulumi.Output<string>;
	electricSecurityGroupId: pulumi.Output<string>;
	privateSubnetIds: [pulumi.Output<string>, pulumi.Output<string>];
	publicSubnetIds: [pulumi.Output<string>, pulumi.Output<string>];
	vpcId: pulumi.Output<string>;
}

function requiredElement<T>(value: T | undefined, label: string): T {
	if (value === undefined) throw new Error(`${label} was not created`);
	return value;
}

export function createNetwork(name: string, config: DeploymentConfig): Network {
	const vpc = new aws.ec2.Vpc(`${name}-vpc`, {
		cidrBlock: "10.42.0.0/16",
		enableDnsHostnames: true,
		enableDnsSupport: true,
		tags: { Name: `${name}-vpc` },
	});
	const internetGateway = new aws.ec2.InternetGateway(`${name}-igw`, {
		vpcId: vpc.id,
		tags: { Name: `${name}-igw` },
	});
	const publicRouteTable = new aws.ec2.RouteTable(`${name}-public-rt`, {
		vpcId: vpc.id,
		tags: { Name: `${name}-public` },
	});
	new aws.ec2.Route(`${name}-internet-route`, {
		destinationCidrBlock: "0.0.0.0/0",
		gatewayId: internetGateway.id,
		routeTableId: publicRouteTable.id,
	});

	const publicSubnets = config.availabilityZones.map(
		(zone, index) =>
			new aws.ec2.Subnet(`${name}-public-${index + 1}`, {
				availabilityZone: zone,
				cidrBlock: `10.42.${index}.0/24`,
				mapPublicIpOnLaunch: true,
				tags: { Name: `${name}-public-${index + 1}` },
				vpcId: vpc.id,
			}),
	);
	const privateSubnets = config.availabilityZones.map(
		(zone, index) =>
			new aws.ec2.Subnet(`${name}-private-${index + 1}`, {
				availabilityZone: zone,
				cidrBlock: `10.42.${index + 10}.0/24`,
				mapPublicIpOnLaunch: false,
				tags: { Name: `${name}-private-${index + 1}` },
				vpcId: vpc.id,
			}),
	);

	for (const [index, subnet] of publicSubnets.entries()) {
		new aws.ec2.RouteTableAssociation(`${name}-public-rta-${index + 1}`, {
			routeTableId: publicRouteTable.id,
			subnetId: subnet.id,
		});
	}
	const privateRouteTable = new aws.ec2.RouteTable(`${name}-private-rt`, {
		vpcId: vpc.id,
		tags: { Name: `${name}-private` },
	});
	for (const [index, subnet] of privateSubnets.entries()) {
		new aws.ec2.RouteTableAssociation(`${name}-private-rta-${index + 1}`, {
			routeTableId: privateRouteTable.id,
			subnetId: subnet.id,
		});
	}

	const securityGroup = (suffix: string, description: string) =>
		new aws.ec2.SecurityGroup(`${name}-${suffix}`, {
			description,
			egress: [],
			ingress: [],
			namePrefix: `${name}-${suffix}-`,
			revokeRulesOnDelete: true,
			vpcId: vpc.id,
		});
	const alb = securityGroup("alb-sg", "Public TLS load balancer");
	const app = securityGroup("app-sg", "Superset application tasks");
	const electric = securityGroup(
		"electric-sg",
		"Electric synchronization task",
	);
	const database = securityGroup("database-sg", "PostgreSQL data tier");
	const cache = securityGroup("cache-sg", "Redis cache tier");

	for (const [nameSuffix, port] of [
		["web", 3000],
		["api", 3001],
		["electric-proxy", 8787],
	] as const) {
		new aws.ec2.SecurityGroupRule(`${name}-alb-to-${nameSuffix}`, {
			fromPort: port,
			protocol: "tcp",
			securityGroupId: alb.id,
			sourceSecurityGroupId: app.id,
			toPort: port,
			type: "egress",
		});
		new aws.ec2.SecurityGroupRule(`${name}-${nameSuffix}-from-alb`, {
			fromPort: port,
			protocol: "tcp",
			securityGroupId: app.id,
			sourceSecurityGroupId: alb.id,
			toPort: port,
			type: "ingress",
		});
	}
	new aws.ec2.SecurityGroupRule(`${name}-https-ingress`, {
		cidrBlocks: ["0.0.0.0/0"],
		fromPort: 443,
		protocol: "tcp",
		securityGroupId: alb.id,
		toPort: 443,
		type: "ingress",
	});
	new aws.ec2.SecurityGroupRule(`${name}-http-ingress`, {
		cidrBlocks: ["0.0.0.0/0"],
		fromPort: 80,
		protocol: "tcp",
		securityGroupId: alb.id,
		toPort: 80,
		type: "ingress",
	});

	for (const [workload, group] of [
		["app", app],
		["electric", electric],
	] as const) {
		for (const [protocol, port] of [
			["udp", 53],
			["tcp", 53],
		] as const) {
			new aws.ec2.SecurityGroupRule(`${name}-${workload}-dns-${protocol}`, {
				cidrBlocks: [vpc.cidrBlock],
				fromPort: port,
				protocol,
				securityGroupId: group.id,
				toPort: port,
				type: "egress",
			});
		}
		new aws.ec2.SecurityGroupRule(`${name}-${workload}-https-egress`, {
			cidrBlocks: ["0.0.0.0/0"],
			fromPort: 443,
			protocol: "tcp",
			securityGroupId: group.id,
			toPort: 443,
			type: "egress",
		});
	}

	new aws.ec2.SecurityGroupRule(`${name}-app-to-electric`, {
		fromPort: 3000,
		protocol: "tcp",
		securityGroupId: app.id,
		sourceSecurityGroupId: electric.id,
		toPort: 3000,
		type: "egress",
	});
	new aws.ec2.SecurityGroupRule(`${name}-electric-from-app`, {
		fromPort: 3000,
		protocol: "tcp",
		securityGroupId: electric.id,
		sourceSecurityGroupId: app.id,
		toPort: 3000,
		type: "ingress",
	});
	for (const [workload, group] of [
		["app", app],
		["electric", electric],
	] as const) {
		new aws.ec2.SecurityGroupRule(`${name}-${workload}-to-postgres`, {
			fromPort: 5432,
			protocol: "tcp",
			securityGroupId: group.id,
			sourceSecurityGroupId: database.id,
			toPort: 5432,
			type: "egress",
		});
		new aws.ec2.SecurityGroupRule(`${name}-postgres-from-${workload}`, {
			fromPort: 5432,
			protocol: "tcp",
			securityGroupId: database.id,
			sourceSecurityGroupId: group.id,
			toPort: 5432,
			type: "ingress",
		});
	}
	new aws.ec2.SecurityGroupRule(`${name}-app-to-cache`, {
		fromPort: 6379,
		protocol: "tcp",
		securityGroupId: app.id,
		sourceSecurityGroupId: cache.id,
		toPort: 6379,
		type: "egress",
	});
	new aws.ec2.SecurityGroupRule(`${name}-cache-from-app`, {
		fromPort: 6379,
		protocol: "tcp",
		securityGroupId: cache.id,
		sourceSecurityGroupId: app.id,
		toPort: 6379,
		type: "ingress",
	});

	return {
		albSecurityGroupId: alb.id,
		appSecurityGroupId: app.id,
		cacheSecurityGroupId: cache.id,
		databaseSecurityGroupId: database.id,
		electricSecurityGroupId: electric.id,
		privateSubnetIds: [
			requiredElement(privateSubnets[0], "first private subnet").id,
			requiredElement(privateSubnets[1], "second private subnet").id,
		],
		publicSubnetIds: [
			requiredElement(publicSubnets[0], "first public subnet").id,
			requiredElement(publicSubnets[1], "second public subnet").id,
		],
		vpcId: vpc.id,
	};
}
