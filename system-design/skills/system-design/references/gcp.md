# Google Cloud Service Selection Cheat-Sheet

Best-fit service per need, with the criterion that decides between close alternatives. The skill
body has the compressed three-cloud table; this is the Google Cloud version with the "pick X when"
reasoning. The golden rule: **prefer managed/serverless**, and **tie every choice to the access
pattern or requirement**, never the brand name.

**Distinctive strengths** (for cross-cloud decisions): global-by-default primitives (a VPC spans
regions; one anycast IP load-balances the planet); BigQuery's serverless warehouse; Spanner's
horizontally scalable *strongly consistent* relational; Kubernetes provenance (GKE); the
data/ML/Gemini stack. Naming watch: Cloud Functions → **Cloud Run functions**; the Vertex AI agent
stack is being rebranded **Gemini Enterprise Agent Platform** (2026) — docs still say Vertex AI.

## Compute

| Service | Use when |
|---|---|
| **Cloud Run** | The default: serverless containers, scale-to-zero, per-request billing; services (HTTP), jobs (batch), GPUs available. Covers most "app tier" needs. |
| **Cloud Run functions** | Event-driven glue as single functions (built on Cloud Run; formerly Cloud Functions). Pick when you want a function, not a container image. |
| **GKE** | You're standardized on Kubernetes or need its ecosystem/API. Autopilot mode (default) removes node management. |
| **Compute Engine** | Raw control: custom OS/kernel, GPUs/TPUs, licensing, stateful workloads. Pair with Managed Instance Groups. |

Decision: **Cloud Run** for nearly everything stateless (it spans the Lambda *and* Fargate roles) →
**GKE** only if k8s is a requirement → **Compute Engine** when you need the metal. There is no
"ECS-like" middle tier to choose — that simplicity is the point.

## Storage

| Service | Use when |
|---|---|
| **Cloud Storage** | Object storage: blobs, media, backups, data lakes, static assets. 11 nines durability; Standard/Nearline/Coldline/Archive classes; dual- and multi-region buckets replicate across regions natively. |
| **Persistent Disk / Hyperdisk** | Block volume attached to a VM (Hyperdisk for tunable high IOPS). |
| **Filestore** | Managed NFS shared across many instances. |

Decision: blobs → **Cloud Storage** (pick the class by access frequency; multi-region bucket when
readers are global); one VM's disk → **Persistent Disk**; shared POSIX → **Filestore**.

## Databases

| Service | Use when |
|---|---|
| **Cloud SQL** (Postgres/MySQL/SQL Server) | Default managed relational for modest-to-large needs. |
| **AlloyDB** | Postgres-compatible with cloud-native performance (Google claims ~4× transactional throughput, columnar engine for analytics on live data). The Aurora analog — pick when Cloud SQL tops out. |
| **Spanner** | Horizontally scalable relational with **global strong consistency** and up to 99.999% multi-region SLA. Unique among the three clouds — pick when you need relational semantics *and* planet-scale writes; costs more, minimum footprint. |
| **Firestore** | Serverless document DB: single-digit-ms, real-time listeners, offline sync, multi-region replication built in; MongoDB-compatible API available. Default KV/doc pick for app data. |
| **Bigtable** | Wide-column NoSQL for huge, high-throughput, low-latency key/row workloads (time series, personalization, telemetry) — the HBase/Cassandra analog. Firestore for app docs; Bigtable for firehose-scale rows. |
| **Memorystore** (Valkey/Redis/Memcached) | In-memory cache: sessions, leaderboards, hot reads, rate-limit counters. Valkey is the strategic engine. |
| **BigQuery** | Serverless columnar warehouse for OLAP/BI — no clusters to size; also does search indexes and vector search over analytical data. |

Decision: joins/ad-hoc queries → **Cloud SQL**, then **AlloyDB** for scale; global relational with
strong consistency → **Spanner** (justify the cost from the requirement); known-key app documents →
**Firestore**; massive narrow-row throughput → **Bigtable**; hot repeatable reads → **Memorystore**;
OLAP → **BigQuery**, never the OLTP store. Note Firestore's real-time sync can delete a whole
"push updates" subsystem — check whether the design needs one before building it.

## Messaging, streaming, pub/sub

| Service | Use when |
|---|---|
| **Pub/Sub** | One global service covering queue *and* fan-out *and* stream: push/pull delivery, ordering keys, exactly-once (regional), dead-letter topics, seek/replay via snapshots, retention. Default for decoupling, events, and most streaming. |
| **Cloud Tasks** | Targeted task dispatch: rate limits, scheduled/deferred execution, per-task HTTP targets — when you control *who* processes *when* (the SQS-delay/throttle analog). |
| **Eventarc** | Routes Google-service and custom events to Cloud Run/GKE/Workflows with filtering — the EventBridge analog for platform events. |
| **Managed Service for Apache Kafka** | Kafka semantics/ecosystem requirement. |

Decision: **Pub/Sub** by default — it deliberately spans SQS+SNS+much of Kinesis; **Cloud Tasks**
when you need rate-controlled, addressed dispatch rather than broadcast; **Eventarc** to wire cloud
events into compute; **Kafka** only when "it must be Kafka." Pub/Sub retains and can replay
(snapshots/seek), so the queue-vs-stream fork is a configuration here, not a service choice.

## API, edge, CDN

| Service | Use when |
|---|---|
| **API Gateway** | Lightweight managed gateway (auth, keys, OpenAPI) fronting Cloud Run/functions. |
| **Apigee** | Full API management: monetization, quotas, developer portal, analytics, hybrid. Pick when APIs are a product. |
| **Cloud Load Balancing** | **Global external Application LB**: one anycast IP, L7 routing to backends in *any* region, TLS at edge — global entry without DNS games. Regional and internal variants; **Network LB** for L4. |
| **Cloud CDN / Media CDN** | Edge caching attached to the global LB / large-scale media delivery. |
| **Cloud Armor** | WAF + DDoS protection at the LB edge. |

Decision: HTTP entry → **global external Application LB** (+ **Cloud CDN**); API lifecycle → **API
Gateway** (simple) or **Apigee** (API-as-product); L4/non-HTTP → **Network LB**. The global anycast
LB replaces the DNS-based global routing other clouds need — one IP, nearest POP, cross-region
failover built in.

## Networking

| Service | Use when |
|---|---|
| **VPC** | **Global** by default — subnets are regional, one network spans the world (no peering needed for cross-region). Firewall rules, Shared VPC for org-wide networks. |
| **Cloud DNS** | Public/private zones; routing policies (weighted, geo, failover). |
| **Private Service Connect** | Private connectivity to Google APIs and producer services — the PrivateLink analog. |
| **Cloud Interconnect / Cloud VPN** | Dedicated private / encrypted links to on-prem. |
| **Cloud NAT** | Outbound-only internet for private subnets. |

## Observability

| Service | Use when |
|---|---|
| **Cloud Monitoring** | Metrics, alerts, dashboards, uptime checks (the operations suite, ex-Stackdriver). |
| **Cloud Logging** | Centralized logs with analytics (Log Analytics on BigQuery). |
| **Cloud Trace** | Distributed tracing — find the slow hop. |
| **Cloud Audit Logs** | Admin/data access audit (the CloudTrail analog). |

## Identity & security

| Service | Use when |
|---|---|
| **IAM + service accounts** | Workload identity: roles, least privilege; **Workload Identity Federation** for keyless auth from outside GCP (and GKE Workload Identity inside). Avoid exported service-account keys. |
| **Identity Platform** | End-user sign-up/sign-in (CIAM), federation, JWTs — enterprise Firebase Auth. |
| **Secret Manager** | Store/version/rotate secrets. |
| **Cloud KMS** | Managed encryption keys (CMEK across services). |
| **Cloud Armor** | L7 filtering / DDoS at the edge. |

Decision: workload-to-GCP auth → **service accounts** (federated, keyless where possible); human
users → **Identity Platform**; secrets → **Secret Manager**; keys → **Cloud KMS**; web attack
surface → **Cloud Armor** on the global LB.

## AI / ML & generative AI

| Service | Use when |
|---|---|
| **Vertex AI** | Managed foundation models (Gemini + Model Garden incl. Claude, Llama) via API, plus train/tune/host your own models — model platform and ML lifecycle in one. Default for LLM/GenAI capability. |
| **Agent Engine + ADK** | Deploy and operate AI *agents*: ADK is the code-first framework; Agent Engine the managed runtime with Sessions and Memory Bank; A2A for agent-to-agent; MCP tool governance. Being rebranded Gemini Enterprise Agent Platform. → see `references/agentic-ai.md`. |
| **Vertex AI Search** | Managed retrieval for RAG (semantic/hybrid over your corpus); alternatives: AlloyDB/Cloud SQL pgvector, BigQuery vector search, Vertex AI Vector Search for pure ANN at scale. |
| **BigQuery ML** | Train/serve models with SQL inside the warehouse — cheap first step for tabular ML. |

Decision: need an LLM capability → **Vertex AI (Gemini)**; need an autonomous, tool-using, stateful
agent in production → **Agent Engine + ADK**; need RAG retrieval → **Vertex AI Search** or pgvector
in the DB you already run; bespoke model lifecycle → **Vertex AI** custom training.

## Workflow orchestration

| Service | Use when |
|---|---|
| **Workflows** | Serverless step orchestration (sequencing, retries, compensation, callbacks) — the Step Functions analog. |
| **Cloud Composer** | Managed Airflow for data-pipeline DAGs. |
| **Cloud Scheduler** | Cron: fire an HTTP/Pub/Sub target on a schedule. |

## Mapping a generic component to a service

| Generic component | Google Cloud service(s) |
|---|---|
| Load balancer | Global external Application LB (L7) · Network LB (L4) |
| Application / compute tier | Cloud Run · Cloud Run functions · GKE · Compute Engine |
| Relational database | Cloud SQL · AlloyDB · Spanner (global strong consistency) |
| NoSQL / key-value store | Firestore · Bigtable (firehose scale) |
| Cache | Memorystore |
| Object / blob storage | Cloud Storage |
| Message queue | Pub/Sub · Cloud Tasks (rate-controlled dispatch) |
| Pub/sub | Pub/Sub · Eventarc |
| Event stream | Pub/Sub · Managed Kafka |
| Stream processing | Dataflow |
| API gateway | API Gateway · Apigee |
| CDN / edge | Cloud CDN · Media CDN |
| DNS | Cloud DNS |
| Search | Vertex AI Search · BigQuery search indexes · partner Elastic |
| Data warehouse / analytics | BigQuery (+ Dataflow for stream/batch processing) |
| Workflow orchestration | Workflows · Cloud Composer |
| Monitoring / logging | Cloud Monitoring · Logging · Trace |
| Auth | IAM service accounts · Identity Platform |
| Secrets / keys | Secret Manager · Cloud KMS |
| Vector store (RAG) | Vertex AI Search · pgvector (AlloyDB/Cloud SQL) · BigQuery |
| ML / recommendations | Vertex AI · BigQuery ML |
| Generative AI / LLM | Vertex AI (Gemini) |
| AI agents at scale | Agent Engine + ADK (Gemini Enterprise Agent Platform) |
| Media transcoding | Transcoder API · Live Stream API |
