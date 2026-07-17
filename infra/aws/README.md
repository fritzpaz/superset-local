# Superset Local on AWS

This Pulumi project creates a cost-conscious, durable production baseline. It does not certify
HIPAA compliance. Do not place ePHI in the deployment until the operator has executed an AWS BAA,
verified every selected service and feature is HIPAA eligible, completed a risk analysis, and
closed or formally treated the gaps in
[`appliance/docs/HIPAA_CONTROL_MATRIX.md`](../../appliance/docs/HIPAA_CONTROL_MATRIX.md).

## Architecture and cost posture

The default stack uses:

- one public Application Load Balancer with TLS and encrypted S3 access logs;
- one ECS Fargate application task containing API, web, the Electric authorization proxy, and a
  Redis REST adapter;
- one ECS Fargate Electric task registered in a private Cloud Map namespace;
- one private encrypted RDS PostgreSQL `db.t4g.micro` instance with 20 GiB gp3 storage, seven-day
  backups, deletion protection, and logical replication;
- one private encrypted ElastiCache Redis `cache.t4g.micro` node with TLS, authentication, and
  snapshots;
- Secrets Manager, customer-managed KMS keys, CloudWatch logs, and basic health/storage alarms.

Fargate is serverless compute: there are no EC2 hosts to patch. Application tasks run in public
subnets with public IPs so they can pull images and emit logs without a continuously billed NAT
Gateway. Security groups admit no public traffic to tasks and allow only DNS, HTTPS, and explicit
data-tier paths outbound. This is the principal low-cost tradeoff: HTTPS egress is not hostname
allowlisted. Add private ECR/Logs/Secrets endpoints plus an egress proxy or AWS Network Firewall
when policy requires network-enforced FQDN allowlisting.

RDS and ElastiCache have no public route. Two Availability Zones are always created even when the
default data stores are Single-AZ, making the higher-durability switch an in-place configuration
change.

## Prerequisites

1. An AWS account covered by the operator's executed AWS BAA and organization controls.
2. An encrypted, access-controlled Pulumi backend. Pulumi state contains secret ciphertext and
   infrastructure metadata; protect access and recovery keys.
3. A validated ACM certificate for the application hostname.
4. Three immutable, vulnerability-scanned images in approved registries:
   - the appliance image built from [`appliance/Dockerfile`](../../appliance/Dockerfile);
   - Electric mirrored from the reviewed upstream version;
   - `serverless-redis-http` mirrored from a reviewed source/version.
5. Two distinct Availability Zones in the selected Region.
6. Docker Buildx, Bun 1.3.14, Pulumi, and AWS credentials for the target account.

Images are digest-pinned by default. The task platform is Linux ARM64 to minimize Fargate cost;
build or verify every image for `linux/arm64`.

## Build the application image

Next public values are embedded during build. Use the final hostname, then record the produced
digest rather than deploying a mutable tag:

```sh
docker buildx build \
  --platform linux/arm64 \
  --build-arg SUPERSET_HIPAA_MODE=true \
  --build-arg NEXT_PUBLIC_API_URL=https://superset.example.com \
  --build-arg NEXT_PUBLIC_WEB_URL=https://superset.example.com \
  --build-arg NEXT_PUBLIC_ELECTRIC_URL=https://superset.example.com \
  --file appliance/Dockerfile \
  --tag 111122223333.dkr.ecr.us-east-1.amazonaws.com/superset-local:release-id \
  --push .
```

Resolve the registry digest, attach scan/SBOM/signature evidence, and use the
`repository@sha256:...` value in Pulumi configuration. Apply the same mirror-and-review process to
Electric and the Redis adapter. Do not use `latest` for production.

## Configure and deploy

From `infra/aws`:

```sh
bun install --frozen-lockfile
pulumi stack init production
cp Pulumi.production.yaml.example Pulumi.production.yaml
# Edit every placeholder. Do not put application secrets in this file.
pulumi preview --diff
pulumi up
```

The stack generates database, Redis, auth, Electric, application-encryption, and initial-admin
secrets. It injects individual JSON keys from Secrets Manager into tasks; it does not expose
secret values as Pulumi outputs.

Database migrations are intentionally a separate, auditable one-off task instead of a side
effect of every application restart. After the first `pulumi up`, run the exact command shown by:

```sh
pulumi stack output migrationCommand
```

Wait for a successful ECS task exit and review `/superset/<stack>/migration` logs. The first
application tasks can be unhealthy until this completes, then they should recover without data
loss. Run the migration task once per reviewed schema release before shifting production traffic.

Retrieve the generated initial password only through an approved administrator workflow, sign in,
create named administrator accounts, then rotate or disable bootstrap access. Never paste the
secret into tickets, chat, shell history, or logs.

## Validation and operations

Before ePHI use and for every release:

1. Run `bun run typecheck`, `bun test`, and `pulumi preview --diff` here.
2. Validate the repository tests, endpoint audit, container build, and container health checks.
3. Verify the AWS account ID, BAA coverage, Region, certificate, DNS, image digests, and scan
   results.
4. Confirm RDS has applied `rds.logical_replication=1` after its initial reboot and monitor stale
   replication slots; an unread slot can exhaust storage.
5. Send CloudWatch alarms to a staffed SNS destination and test notification/escalation.
6. Enable and review organization CloudTrail, AWS Config/Security Hub controls, GuardDuty, ECR
   enhanced scanning, and any required VPC/DNS flow evidence at the account level.
7. Restore an RDS backup into an isolated environment, validate application integrity, record
   measured RTO/RPO, and securely destroy the exercise environment.
8. Verify ALB access-log delivery. Treat logs as potentially containing ePHI metadata and control
   access/retention accordingly.
9. Test session expiration, authorization boundaries, logout/revocation, account termination,
   disaster recovery, and incident evidence collection.

Deletion protection and Pulumi resource protection are enabled for RDS, Redis, and Secrets
Manager. Destruction requires an explicit, reviewed unprotect/change and still creates an RDS
final snapshot. That friction is intentional.

## Higher durability profile

Set `highAvailability: true` to deploy two application tasks across the two subnets, RDS Multi-AZ,
and a two-node Redis replication group with automatic failover. This materially increases steady
cost and removes common single-instance failure modes. It does not make the system multi-Region.

For stricter RTO/RPO or larger workloads, evaluate and load-test:

- RDS Multi-AZ or an Aurora PostgreSQL design that has been proven with Electric logical
  replication; monitor slot survival through failover;
- cross-Region/cross-account AWS Backup copies and a rehearsed infrastructure restore;
- two or more application tasks with autoscaling and deployment alarms;
- Electric's supported high-availability topology for the exact pinned release—do not increase
  replicas blindly because logical replication slot behavior is version-specific;
- private ECS subnets with ECR, S3, CloudWatch Logs, and Secrets Manager VPC endpoints, plus an
  inspected egress path;
- AWS WAF managed rules and application-aware rate limits;
- end-to-end workload TLS between the ALB, containers, Electric, and internal services;
- a second Region with documented DNS, secrets, image, database, and operational failover.

## Other serverless options

The provided baseline already uses Fargate serverless compute. Lambda is a poor fit for the
long-running Next servers, streaming shape requests, and Electric replication process. Aurora
Serverless v2 and ElastiCache Serverless may be reasonable for bursty environments, but they are
not automatically cheaper at steady low load and must be tested for logical replication,
connection, failover, and non-pausing requirements. The node-based defaults are simpler to reason
about and have predictable minimum cost.

Use current regional pricing calculators before approval; this repository intentionally makes no
fixed monthly-price promise.

## Known residual risks

- No application-level immutable user audit ledger is implemented.
- MFA is not implemented by this appliance.
- Internal ALB-to-task and authorization-proxy-to-Electric traffic uses HTTP inside restricted VPC
  security-group paths.
- Public-task HTTPS egress is CIDR-wide to avoid NAT/private-endpoint baseline cost.
- Single-AZ defaults favor cost over failover; use `highAvailability` when outage tolerance does
  not permit this.
- The operator owns all desktop, host-service, model-provider, Git, email, workforce, incident,
  retention, and breach-notification controls.

See the control matrix before accepting any of these risks.
