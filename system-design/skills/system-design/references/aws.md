# AWS Service Selection Cheat-Sheet

Best-fit service per need, with the criterion that decides between close alternatives. The skill
body has the compressed three-cloud table; this is the AWS version with the "pick X when" reasoning.
The golden rule: **prefer managed/serverless** (it removes undifferentiated heavy lifting — a
Well-Architected default), and **tie every choice to the access pattern or requirement**, never the
brand name.

**Distinctive strengths** (for cross-cloud decisions): the broadest and deepest service catalog;
DynamoDB's single-digit-ms at any scale; the most mature serverless ecosystem (Lambda + Step
Functions + EventBridge); Aurora DSQL for active-active multi-Region SQL; the largest Region
footprint and marketplace.

## Compute

| Service | Use when |
|---|---|
| **Lambda** | Event-driven, spiky, or glue workloads; no server management; sub-second billing. Short tasks (≤15 min), stateless. |
| **ECS on Fargate** | Containers without managing nodes. Long-running services, custom runtimes, steady or bursty load. The default container pick. |
| **EKS** | You're standardized on Kubernetes or need its ecosystem/portability. Auto Mode removes most node management; still more overhead than ECS. |
| **EC2** | Need raw control: custom OS/kernel, GPUs, specialized instances, licensing, or long-running stateful workloads. Pair with Auto Scaling Groups. |

Decision: **Lambda** for event/glue and spiky traffic → **Fargate** when it's a long-running service
or Lambda's limits (duration, package size, cold start) bite → **EKS** only if k8s is a requirement
→ **EC2** when you need the metal.

## Storage

| Service | Use when |
|---|---|
| **S3** | Object storage: blobs, media, backups, data lakes, static site assets. 11 nines durability. The default "where do big files live" answer. |
| **EBS** | Block volume attached to a *single* EC2 instance — the instance's disk (gp3 general, io2 high-IOPS). |
| **EFS** | Elastic NFS shared across *many* Linux instances simultaneously. |
| **FSx** | Managed file systems with a specific flavor: Windows File Server, Lustre (HPC), NetApp ONTAP, OpenZFS. |
| **S3 Glacier** | Cold/archival objects; cheap storage, retrieval latency acceptable. |

Decision: blobs → **S3**; one instance's disk → **EBS**; shared POSIX across a fleet → **EFS**;
archive → **Glacier**.

## Databases

| Service | Use when |
|---|---|
| **Aurora** (Postgres/MySQL) | Relational with cloud-native performance (≈5× MySQL throughput), auto-scaling storage, fast failover. Default relational pick at scale. |
| **RDS** (Postgres/MySQL/etc.) | Standard managed relational; simpler/cheaper than Aurora for modest needs. |
| **Aurora Serverless v2** | Relational with spiky/unpredictable load — scales capacity automatically. |
| **Aurora DSQL** | Serverless *distributed* SQL with active-active multi-Region writes and strong consistency. Postgres-compatible with feature limits — check them before committing. |
| **DynamoDB** | Key-value/document NoSQL; single-digit-ms at any scale; serverless. Pick when access patterns are known and there are no joins/ad-hoc queries. Global tables for multi-Region (now with an optional strongly consistent mode). |
| **DAX** | Microsecond reads in front of DynamoDB specifically (write-through cache). |
| **ElastiCache** (Valkey/Redis/Memcached) | In-memory cache: sessions, leaderboards, hot reads, rate-limit counters. Sub-ms. Valkey is the default engine pick. |
| **OpenSearch** | Full-text search, log/observability analytics, vector search when queries need low latency. |
| **Redshift** | Columnar data warehouse for OLAP/BI over large datasets. |
| **Neptune** / **Timestream for InfluxDB** / **DocumentDB** | Graph / time-series / MongoDB-compatible document. (Timestream for LiveAnalytics is closed to new customers — new time-series goes to InfluxDB, DynamoDB, or Managed Prometheus.) |

Decision: **relational vs NoSQL** turns on access pattern, not scale alone — joins, ad-hoc queries,
and multi-row transactions favor **Aurora/RDS**; high-volume known-key access favors **DynamoDB**.
Add **ElastiCache** when reads are hot and repeatable; **DAX** only when the backing store is
DynamoDB. **Redshift** is analytics, not a transactional store — don't put OLTP on it. Reach for
**Aurora DSQL** only when multi-Region active-active SQL is a genuine requirement.

## Messaging, streaming, pub/sub

| Service | Use when |
|---|---|
| **SQS** | Decouple producer and consumer; smooth bursts; at-least-once work queue. FIFO variant for strict ordering + exactly-once. Add a dead-letter queue. |
| **SNS** | Pub/sub fan-out: one message pushed to many subscribers (topics). Pairs with SQS for fan-out-to-queues. |
| **EventBridge** | Event bus with content-based routing/filtering; SaaS and AWS-service event integration; scheduled events; archive & replay. |
| **Kinesis Data Streams** | Ordered, replayable, sharded real-time stream — clickstreams, telemetry, ordered event processing with multiple consumers. |
| **MSK** | Managed Apache Kafka — high-throughput streaming when you need Kafka semantics/ecosystem. |

Decision: **SQS** to decouple work → **SNS/EventBridge** to fan out (EventBridge when you route on
event content) → **Kinesis** when you need ordering + replay + multiple independent consumers →
**MSK** when "it must be Kafka." Key distinction: a **queue** (SQS) deletes a message once consumed;
a **stream** (Kinesis/MSK) retains it for replay by many consumers.

## API, edge, CDN

| Service | Use when |
|---|---|
| **API Gateway** | Managed REST/HTTP/WebSocket APIs; throttling, auth, request validation; fronts Lambda or services. |
| **AppSync** | Managed GraphQL with real-time subscriptions. |
| **CloudFront** | Global CDN: cache static/dynamic content at edge POPs, lower latency, absorb load, TLS termination, WAF attach point. |
| **Lambda@Edge / CloudFront Functions** | Run logic at the edge (header rewrites, auth, A/B) — Functions for lightweight/fast, Lambda@Edge for heavier. |
| **Global Accelerator** | Anycast static IPs routing over the AWS backbone for non-HTTP or latency-sensitive TCP/UDP traffic. |

Decision: HTTP API → **API Gateway** (or **ALB** for plain L7 to containers); GraphQL → **AppSync**;
content delivery / edge caching → **CloudFront**; non-HTTP global low latency → **Global
Accelerator**.

## Networking

| Service | Use when |
|---|---|
| **VPC** | The isolated virtual network: subnets, route tables, security groups, NACLs. Regional; subnets are per-AZ. |
| **ALB** (Application LB) | Layer 7 / HTTP(S): path- and host-based routing, WebSockets, to containers/instances/Lambda. |
| **NLB** (Network LB) | Layer 4 / TCP-UDP: ultra-low latency, millions of connections, static IP, preserves source IP. |
| **GWLB** (Gateway LB) | Insert virtual appliances (firewalls, IDS) transparently into the traffic path. |
| **Route 53** | DNS + health-checked routing policies: latency, geolocation, weighted, failover, multivalue. |
| **PrivateLink** | Private service-to-service connectivity without traversing the internet. |
| **Direct Connect / VPN** | Dedicated private / encrypted links to on-prem. |

Decision: **ALB vs NLB** is the classic — L7 features and HTTP routing → **ALB**; raw TCP/UDP
throughput, lowest latency, static IP, or source-IP preservation → **NLB**. See
`references/networking-os.md` for the L4-vs-L7 mechanics.

## Observability

| Service | Use when |
|---|---|
| **CloudWatch** | Metrics, logs, alarms, dashboards — the default. Alarm on the metrics that reflect customer experience, not just CPU. |
| **X-Ray** | Distributed tracing across microservices — find the slow hop. |
| **CloudTrail** | Audit log of every AWS API/account action (security, compliance, forensics). |
| **Managed Grafana / Managed Prometheus** | Richer dashboards / Prometheus-style metrics for container & k8s workloads. |

## Identity & security

| Service | Use when |
|---|---|
| **IAM** | Permissions for AWS workloads and services — roles, least privilege. |
| **Cognito** | End-user sign-up/sign-in, federation, JWT tokens for your app's users. |
| **Secrets Manager** | Store + automatically rotate secrets (DB creds, API keys). |
| **KMS** | Managed encryption keys for data at rest across services. |
| **WAF / Shield** | L7 request filtering / DDoS protection at the edge (attach to CloudFront, ALB, API Gateway). |

Decision: workload-to-AWS auth → **IAM**; your application's human users → **Cognito**; secrets →
**Secrets Manager**; encryption keys → **KMS**; web-facing attack surface → **WAF + Shield**.

## AI / ML & generative AI

| Service | Use when |
|---|---|
| **Bedrock** | Call managed foundation models (text/image/embeddings) via API — no model hosting. The default for adding LLM/GenAI capability. |
| **Bedrock AgentCore** | Deploy and operate AI *agents* at scale: Runtime, Gateway (APIs → agent tools/MCP), Memory, Identity, Policy, Evaluations, Code Interpreter, Browser, Observability. → see `references/agentic-ai.md`. |
| **SageMaker** | Train, tune, and host your *own* models; full ML lifecycle. Reach for it when Bedrock's managed models don't fit. |
| **S3 Vectors** | Native vector storage/query in S3 — cheap RAG/semantic-search at scale; pick OpenSearch instead when queries need consistently low latency. |
| **Kendra / OpenSearch (vectors)** | Retrieval for RAG — semantic search over your corpus to ground an LLM. |
| **Personalize** | Managed recommendation models without building ML infra. |

Decision: need an LLM capability → **Bedrock**; need an autonomous, tool-using, stateful agent in
production → **AgentCore**; need a bespoke model → **SageMaker**; need RAG retrieval → a vector
store (**S3 Vectors** for cost at scale, **OpenSearch** for latency) in front of Bedrock.

## Workflow orchestration

| Service | Use when |
|---|---|
| **Step Functions** | Serverless state-machine orchestration: sequencing, retry/catch, compensation branches, human approval. Standard workflows for long-running/exactly-once; Express for high-volume, short-lived, at-least-once (cheaper). |
| **MWAA** | Managed Airflow for data-pipeline DAGs. |
| **EventBridge Scheduler** | Cron at scale — fire a target on a schedule. |

## Mapping a generic component to a service

When you've sketched the architecture in role terms, this is the translation table:

| Generic component | AWS service(s) |
|---|---|
| Load balancer | ALB (L7) / NLB (L4) |
| Application / compute tier | Lambda · ECS Fargate · EKS · EC2 |
| Relational database | Aurora · RDS · Aurora DSQL (multi-Region active-active) |
| NoSQL / key-value store | DynamoDB |
| Cache | ElastiCache · DAX |
| Object / blob storage | S3 |
| Message queue | SQS |
| Pub/sub | SNS · EventBridge |
| Event stream | Kinesis · MSK |
| Stream processing | Managed Service for Apache Flink |
| API gateway | API Gateway · AppSync |
| CDN / edge | CloudFront |
| DNS | Route 53 |
| Search | OpenSearch |
| Data warehouse / analytics | Redshift · Athena · EMR |
| Workflow orchestration | Step Functions |
| Monitoring / logging | CloudWatch · X-Ray · CloudTrail |
| Auth | IAM · Cognito |
| Secrets / keys | Secrets Manager · KMS |
| Vector store (RAG) | S3 Vectors · OpenSearch |
| ML / recommendations | SageMaker · Personalize |
| Generative AI / LLM | Bedrock |
| AI agents at scale | Bedrock AgentCore |
| Media transcoding | Elemental MediaConvert / MediaLive / MediaPackage |
