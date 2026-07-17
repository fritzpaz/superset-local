# HIPAA security gap and control matrix

This document is an engineering crosswalk, not legal advice, an attestation, or a claim that
Superset Local or any deployment is HIPAA compliant or certified. HIPAA compliance belongs to
the regulated entity's complete program: people, policies, contracts, facilities, endpoints,
vendors, configuration, and evidence all matter. The operator must perform and document its own
risk analysis with qualified privacy, security, and legal reviewers.

The matrix uses the HIPAA Security Rule currently in force. HHS published a proposed
strengthening rule in January 2025, but a proposal is not treated here as final law. Re-evaluate
this matrix whenever the rule, deployment, data flows, or vendors change. Primary references:

- [HHS Security Rule overview](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [HHS risk-analysis guidance](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html)
- [45 CFR Part 164, Subpart C](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C)
- [AWS HIPAA-eligible services reference](https://aws.amazon.com/compliance/hipaa-eligible-services-reference/)

## Status meanings

- **Implemented**: this distribution or the AWS stack provides a concrete technical control.
- **Partial**: a useful control exists, but it does not satisfy the standard by itself.
- **Operator**: organizational facts and procedures cannot be supplied by this repository.
- **Gap**: a material technical capability is absent or requires a deployment-specific control.

## Matrix

| Security Rule area | Status | Repository or AWS baseline | Operator evidence and remaining work |
| --- | --- | --- | --- |
| §164.308(a)(1), risk analysis and risk management | Operator | Threat model, endpoint inventory, default-disabled hosted features, and this gap register provide inputs. | Inventory every ePHI flow, asset, user, vendor, endpoint, and threat; score risk; record accepted risks, owners, deadlines, and compensating controls. Review at least after material change. |
| §164.308(a)(1)(ii)(D), information-system activity review | Partial | ALB access logs, KMS-encrypted CloudWatch application/Electric/RDS logs, health alarms, and database connection logging are provisioned. | Send alarms to a staffed destination, enable organization-level CloudTrail and suitable VPC/DNS evidence, define review cadence, prevent ePHI from entering logs where unnecessary, and retain review records. The app does not yet provide a purpose-built immutable user audit ledger. |
| §164.308(a)(2), assigned security responsibility | Operator | None; code cannot appoint accountable personnel. | Name the security official and document authority, alternates, and escalation paths. |
| §164.308(a)(3)-(4), workforce and information access management | Partial | Unique accounts, database-backed sessions, organization membership checks, and authenticated Electric shape filtering exist. | Provision/deprovision users, approve roles, review access, handle transfers/termination, and validate least privilege across AWS, Git, model providers, desktops, and Superset organizations. |
| §164.308(a)(5), security awareness and training | Operator | Regulated mode requires 12-character local passwords and enables API-key throttling. | Operate training, phishing/malware defenses, login monitoring, password policy, and workforce reminders. Decide whether local passwords are acceptable. |
| §164.308(a)(6), security incident procedures | Operator | Logs and alarms provide inputs; cloud integrations are disabled to reduce unreviewed disclosure paths. | Maintain and exercise detection, triage, containment, evidence preservation, breach assessment/notification, vendor escalation, and post-incident review procedures. |
| §164.308(a)(7), contingency plan | Partial | RDS automated backups, final snapshots, storage autoscaling, encrypted Redis snapshots, deletion protection, and optional Multi-AZ are encoded. | Define RTO/RPO, cross-account/Region backup requirements, emergency-mode operations, and restore credentials. Perform and retain restore tests; a backup that has not been restored is not adequate evidence. |
| §164.308(a)(8), periodic technical and nontechnical evaluation | Operator | Tests and a Pulumi preview validate source artifacts. | Schedule program evaluation, penetration testing, vulnerability management, dependency/image scanning, risk-register review, and evidence retention. Reassess after changes. |
| §164.308(b), business-associate contracts | Operator | The AWS design uses services listed in AWS's HIPAA-eligible reference as of the documented review date. | Execute an AWS BAA before ePHI use. Execute appropriate BAAs with every provider that creates, receives, maintains, or transmits ePHI—including model, support, email, logging, and backup vendors—and confirm the exact product/features are in scope. |
| §164.310(a)-(d), physical safeguards and device/media controls | Operator | Managed AWS facilities cover part of the cloud physical boundary; containers persist application data only to managed data services. | Govern employee endpoints, desktop builds, removable media, facilities, disposal, reuse, device inventory, workstation use, screen locking, and local repository/terminal data. The desktop/host-service boundary can contain ePHI and source-derived secrets. |
| §164.312(a)(1), unique access and authorization | Partial | Unique users, organization-scoped authorization, private data subnets, security groups, and separate task/execution IAM roles exist. | Review roles and API keys, restrict AWS administrators, establish emergency access, and test authorization boundaries. Hosted OAuth is disabled in local mode. |
| §164.312(a)(2)(iii), automatic logoff | Partial | `SUPERSET_HIPAA_MODE=true` disables rolling refresh so database sessions expire 15 minutes after issue, disables the cookie session cache, and limits JWT and OAuth access tokens to five minutes. Session-derived JWTs and organization membership are revalidated against live database state for tRPC authorization. | Confirm the fixed timeout is appropriate in the risk analysis and separately enforce endpoint/desktop screen locking. Electric authorization uses signed membership claims, so revocation can take up to the remaining five-minute token lifetime. Test expiration, logout, and membership removal in each released client. |
| §164.312(a)(2)(iv), encryption and decryption | Partial | RDS, snapshots, Redis, Secrets Manager, and CloudWatch logs use encryption at rest; ALB logs use the AWS-supported SSE-S3 mode; application secrets use envelope/KMS-backed storage. | Control KMS administrators, test key recovery, rotate application credentials, cover endpoint disks and exports, and document any addressable implementation decision. Pulumi state is sensitive and must use an approved encrypted backend. |
| §164.312(b), audit controls | Gap | Infrastructure request, service, and database logs exist. | Add an application audit event model for authentication, organization membership, access to records/workspaces, privilege changes, exports, secret access, and administrator actions; make it tamper-evident and reviewable. Infrastructure logs alone do not answer who viewed or changed ePHI. |
| §164.312(c), integrity | Partial | TLS database connections, authenticated Redis, image digests, reviewed endpoint fingerprints, database constraints, and signed Git history protect parts of the path. | Define record-level integrity requirements, change approval, artifact signing/SBOM verification, protected CI, and detection/recovery for unauthorized application data changes. |
| §164.312(d), person or entity authentication | Gap | Password authentication, signed sessions/JWTs, API keys, and Electric bearer validation exist. | MFA is not implemented in this appliance. Require an approved identity/MFA control before ePHI use, or document the risk-based alternative with counsel. Control service identities and rotate keys. |
| §164.312(e), transmission security | Partial | Internet traffic terminates at a TLS 1.2/1.3 ALB; RDS requires TLS; Redis requires TLS; public HTTP redirects to HTTPS; Electric requests require signed bearer credentials. | ALB-to-container and proxy-to-Electric traffic is HTTP inside security-group-restricted VPC paths. Decide through risk analysis whether this is a reasonable equivalent measure or add end-to-end workload TLS/service mesh. Protect desktop, Git, model-provider, email, and backup transmissions too. |
| §164.314 and §164.316, organizational requirements, policies, and documentation | Operator | Repository documentation identifies code controls and gaps. | Maintain policies, BAAs, risk decisions, sanctions, procedures, configuration evidence, training, incidents, evaluations, and required retention. Source documentation is not the regulated entity's compliance record. |

## Release blockers before ePHI

At minimum, the operator should treat these as deployment blockers rather than optional polish:

1. Executed BAAs and confirmed HIPAA-eligible service/product scope.
2. Completed risk analysis and approved residual-risk register.
3. Identity lifecycle, MFA or documented alternative, emergency access, and access reviews.
4. Application-level audit trail or an approved compensating design.
5. Staffed alerting, incident/breach procedures, and tested escalation.
6. Successful encrypted backup restore with recorded RTO/RPO evidence.
7. Endpoint/desktop protections and approved model/Git/vendor data flows.
8. Vulnerability scanning, signed digest-pinned images, SBOM retention, and patch SLAs.
9. A documented decision for internal workload TLS and outbound egress enforcement.

No setting in this repository removes those responsibilities.
