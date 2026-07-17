import * as pulumi from "@pulumi/pulumi";
import { createComputeLayer } from "./compute";
import { loadConfig } from "./config";
import { createDataLayer } from "./data";
import { createNetwork } from "./network";

const config = loadConfig();
const name = `superset-${config.stackName}`
	.toLowerCase()
	.replace(/[^a-z0-9-]/g, "-")
	.slice(0, 48);

const network = createNetwork(name, config);
const data = createDataLayer(name, config, network);
const compute = createComputeLayer(name, config, network, data);

export const applicationUrl = `https://${config.domainName}`;
export const databaseIdentifier = data.database.identifier;
export const loadBalancerDnsName = compute.alb.dnsName;
export const migrationCommand = pulumi.interpolate`aws ecs run-task --cluster ${compute.cluster.name} --launch-type FARGATE --task-definition ${compute.migrationTaskDefinition.family} --network-configuration 'awsvpcConfiguration={subnets=[${network.publicSubnetIds[0]},${network.publicSubnetIds[1]}],securityGroups=[${network.appSecurityGroupId}],assignPublicIp=ENABLED}'`;
export const runtimeSecretArn = data.credentialsSecret.arn;
