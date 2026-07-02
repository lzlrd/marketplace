# Azure Service Selection Cheat-Sheet

Best-fit service per need, with the criterion that decides between close alternatives. The skill
body has the compressed three-cloud table; this is the Azure version with the "pick X when"
reasoning. The golden rule: **prefer managed/serverless**, and **tie every choice to the access
pattern or requirement**, never the brand name.

**Distinctive strengths** (for cross-cloud decisions): deepest enterprise/Microsoft-estate
integration (Entra ID, Microsoft 365, hybrid via Arc); Cosmos DB's turnkey global distribution with
five selectable consistency levels; first-party OpenAI model access; strongest
compliance/sovereignty story for Microsoft-centric enterprises.

Naming watch (renames bite here): Azure AD → **Microsoft Entra ID** · Azure AD B2C → **Entra
External ID** (B2C closed to new customers) · Azure Cache for Redis → **Azure Managed Redis**
(old tiers retiring 2027–28) · classic CDN/Front Door → **Front Door Standard/Premium** only for
new workloads · Azure AI Foundry → **Microsoft Foundry** · new analytics goes to **Microsoft
Fabric**, not Synapse.

## Compute

| Service | Use when |
|---|---|
| **Azure Functions** | Event-driven, spiky, or glue workloads. Flex Consumption is the default plan (scale-to-zero, VNet integration); Premium for always-warm/low-latency. |
| **Container Apps** | Serverless containers (built on managed k8s + KEDA + Dapr, none of it exposed). Long-running services, microservices, event-driven scale incl. to zero. The default container pick. |
| **AKS** | You're standardized on Kubernetes or need its ecosystem/portability/API. More operational overhead than Container Apps. |
| **App Service** | Classic PaaS for web apps/APIs when you want deploy-from-code with built-in TLS/slots and no container thinking. |
| **Virtual Machines** | Raw control: custom OS/kernel, GPUs, licensing, stateful workloads. Pair with VM Scale Sets. |

Decision: **Functions** for event/glue → **Container Apps** when it's a long-running service or a
container (the Fargate analog) → **AKS** only if k8s is a requirement → **App Service** for plain
web apps teams don't want to containerize → **VMs** when you need the metal.

## Storage

| Service | Use when |
|---|---|
| **Blob Storage** | Object storage: blobs, media, backups, data lakes (ADLS Gen2 = Blob + hierarchical namespace), static assets. Hot/cool/cold/archive tiers. |
| **Managed Disks** | Block volume attached to a single VM (Premium SSD v2 general, Ultra for high-IOPS). |
| **Azure Files** | Managed SMB/NFS file shares across many instances; also mounts into Container Apps/AKS. |
| **Azure NetApp Files** | High-performance POSIX file storage (the FSx analog). |

Decision: blobs → **Blob Storage** (archive tier for cold); one VM's disk → **Managed Disks**;
shared file system → **Azure Files**; demanding POSIX → **NetApp Files**.

## Databases

| Service | Use when |
|---|---|
| **Azure SQL Database** | Default managed relational (SQL Server engine): Hyperscale tier for auto-scaling storage/replicas, serverless compute tier for spiky load. |
| **Database for PostgreSQL / MySQL Flexible Server** | Managed open-source relational when the app speaks Postgres/MySQL. |
| **Cosmos DB** | Multi-model NoSQL (NoSQL, MongoDB, Cassandra, Gremlin, Table APIs): single-digit-ms, serverless or provisioned RU, turnkey multi-region writes, **five consistency levels** (strong → eventual) chosen per account/request. The DynamoDB analog with more consistency knobs. |
| **Azure Managed Redis** | In-memory cache: sessions, leaderboards, hot reads, rate-limit counters. Successor to Azure Cache for Redis — use it for all new workloads. |
| **AI Search** | Full-text + vector + hybrid search over your corpus; the RAG retrieval default. |
| **Microsoft Fabric** | The analytics platform (OneLake + Fabric Warehouse + Real-Time Intelligence + Power BI). Default for new warehouse/BI; Synapse is legacy — don't start new designs on it. |
| **Azure Data Explorer** | Interactive analytics over high-volume telemetry/logs (KQL) when you need it standalone rather than inside Fabric. |

Decision: joins/ad-hoc queries/transactions → **Azure SQL / PostgreSQL**; known-key high-volume
access or global multi-region → **Cosmos DB** (watch RU pricing — model the access pattern before
committing); hot repeatable reads → **Managed Redis**; OLAP/BI → **Fabric**, not the OLTP store.
Mind Cosmos DB's RU model: a hot partition or fat query burns RUs (throttling/cost) the way a bad
DynamoDB partition key burns capacity.

## Messaging, streaming, pub/sub

| Service | Use when |
|---|---|
| **Service Bus** | The enterprise work queue: at-least-once, sessions (ordered groups), duplicate detection, transactions, scheduled delivery, DLQ built in. Default queue pick. |
| **Event Grid** | Pub/sub event routing with content-based filtering; Azure-service and SaaS events; push to handlers or pull; MQTT broker for IoT. The EventBridge analog. |
| **Event Hubs** | High-throughput ordered, replayable, partitioned stream ingestion; **Kafka-compatible endpoint** (existing Kafka clients just point at it). The Kinesis/Kafka analog. |
| **Storage Queues** | Dirt-simple, cheap queue on Blob infrastructure — fine for basic decoupling with no ordering/dedup/sessions needs. |

Decision: decouple work → **Service Bus** (or **Storage Queues** when requirements are trivial and
cost rules) → fan out events → **Event Grid** → ordered replayable stream / Kafka semantics →
**Event Hubs**. Queue deletes on consume; stream retains for replay — same fork as everywhere.

## API, edge, CDN

| Service | Use when |
|---|---|
| **API Management** | Managed API front door: routing, auth, throttling, versioning, developer portal. Consumption tier for serverless-spiky. |
| **Front Door** (Standard/Premium) | Global L7 entry: anycast edge, CDN caching, TLS at edge, WAF, path routing to regional backends. The CloudFront-plus-global-LB analog. Classic CDN and Front Door classic are closed to new workloads — always Standard/Premium. |
| **Application Gateway** | *Regional* L7 load balancer with WAF v2; path/host routing to VMs/AKS/Container Apps inside a region. |
| **Load Balancer** | Layer 4 TCP/UDP, ultra-low latency, static IP; regional (Standard) or cross-region tier. |
| **Traffic Manager** | DNS-based global routing (latency/geo/weighted/priority) for **non-HTTP** endpoints; for HTTP, Front Door supersedes it. |

Decision: global HTTP entry + CDN → **Front Door**; API lifecycle/auth/quotas → **API Management**
(often behind Front Door); regional L7 inside a VNet → **Application Gateway**; raw L4 → **Load
Balancer**; global non-HTTP routing → **Traffic Manager**.

## Networking

| Service | Use when |
|---|---|
| **VNet** | The isolated virtual network: subnets, NSGs, route tables. Regional — peer or hub-and-spoke across regions. |
| **Azure DNS** | Public/private DNS zones. Routing policies live in Traffic Manager, not the zone. |
| **Private Link / Private Endpoint** | Private connectivity to PaaS services and cross-VNet services without internet exposure — the standard "no public endpoints" move. |
| **ExpressRoute / VPN Gateway** | Dedicated private / encrypted links to on-prem. |
| **Azure Firewall / NAT Gateway** | Centralized egress control / outbound SNAT for private subnets. |

## Observability

| Service | Use when |
|---|---|
| **Azure Monitor** | Metrics + Log Analytics (KQL queries) + alerts + dashboards — the platform default. |
| **Application Insights** | APM: distributed tracing, request/dependency telemetry, live metrics. The X-Ray analog, richer out of the box. |
| **Managed Grafana / Managed Prometheus** | Dashboards / Prometheus metrics for container & AKS workloads. |
| **Activity Log / Entra audit logs** | Control-plane and identity audit (the CloudTrail analog). |

## Identity & security

| Service | Use when |
|---|---|
| **Microsoft Entra ID** | Workforce + workload identity. **Managed identities** are the IAM-role analog: workload-to-Azure auth with zero stored credentials — default for every service-to-service call. RBAC scopes permissions. |
| **Entra External ID** | End-user sign-up/sign-in (CIAM), federation, tokens. Successor to Azure AD B2C. |
| **Key Vault** | Secrets, encryption keys, and certificates in one service (Managed HSM tier for FIPS-hard keys). Covers both Secrets Manager and KMS roles. |
| **Web Application Firewall / DDoS Protection** | L7 filtering on Front Door or Application Gateway / network DDoS protection. |
| **Microsoft Defender for Cloud** | Posture management and threat detection across the estate. |

Decision: workload-to-Azure auth → **managed identity** (never connection strings when an identity
works); human users → **Entra External ID**; secrets and keys → **Key Vault**; web attack surface →
**WAF on Front Door/App Gateway + DDoS Protection**.

## AI / ML & generative AI

| Service | Use when |
|---|---|
| **Microsoft Foundry** (formerly Azure AI Foundry) | The AI platform umbrella: Foundry Models (Azure OpenAI GPT-family plus Anthropic, Meta, DeepSeek, xAI…), evaluations, observability via Foundry Control Plane. Default for adding LLM/GenAI capability. |
| **Foundry Agent Service** | Deploy and operate AI *agents*: hosted agents, tool connectivity (1,400+ MCP-enabled tools), Foundry IQ knowledge grounding (SharePoint/Fabric/Bing), managed memory, private networking. → see `references/agentic-ai.md`. |
| **Microsoft Agent Framework** | The OSS SDK (successor unifying Semantic Kernel + AutoGen) when you're writing agent code to run on the above. |
| **Azure Machine Learning** | Train, tune, and host your *own* models; full ML lifecycle (the SageMaker analog). |
| **AI Search (vectors)** | RAG retrieval: vector + hybrid + semantic ranking over your corpus. |

Decision: need an LLM capability → **Foundry Models**; need an autonomous, tool-using, stateful
agent in production → **Foundry Agent Service**; need a bespoke model → **Azure ML**; need RAG
retrieval → **AI Search** in front of the model.

## Workflow orchestration

| Service | Use when |
|---|---|
| **Durable Functions** | Code-first orchestration (function chaining, fan-out/fan-in, sagas with compensation, human interaction) — the Step Functions analog, expressed in code. |
| **Logic Apps** | Low-code integration workflows with 1,000+ connectors (SaaS, B2B, enterprise systems). |

## Mapping a generic component to a service

| Generic component | Azure service(s) |
|---|---|
| Load balancer | Front Door (global L7) · Application Gateway (regional L7) · Load Balancer (L4) |
| Application / compute tier | Functions · Container Apps · AKS · App Service · VMs |
| Relational database | Azure SQL Database · PostgreSQL/MySQL Flexible Server |
| NoSQL / key-value store | Cosmos DB |
| Cache | Azure Managed Redis |
| Object / blob storage | Blob Storage (ADLS Gen2 for lakes) |
| Message queue | Service Bus · Storage Queues |
| Pub/sub | Event Grid |
| Event stream | Event Hubs |
| Stream processing | Stream Analytics · Fabric Real-Time Intelligence |
| API gateway | API Management |
| CDN / edge | Front Door Standard/Premium |
| DNS | Azure DNS (+ Traffic Manager for routing policies) |
| Search | AI Search |
| Data warehouse / analytics | Microsoft Fabric (OneLake, Warehouse) · Data Explorer |
| Workflow orchestration | Durable Functions · Logic Apps |
| Monitoring / logging | Azure Monitor · Application Insights |
| Auth | Entra ID (managed identities) · Entra External ID |
| Secrets / keys | Key Vault |
| Vector store (RAG) | AI Search · Cosmos DB vector search |
| ML / recommendations | Azure Machine Learning |
| Generative AI / LLM | Microsoft Foundry (Foundry Models / Azure OpenAI) |
| AI agents at scale | Foundry Agent Service |
| Media transcoding | partner services (native Media Services retired) |
