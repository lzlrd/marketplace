# Cloudflare Service Selection Cheat-Sheet

Best-fit service per need, with the criterion that decides between close alternatives. The skill body
has the compressed multi-cloud table; this is the Cloudflare version with the "pick X when"
reasoning. Cloudflare is **edge-first**: code and data live at every point of presence on one global
anycast network, not in regions you place. So the golden rule shifts — **prefer the edge-native
primitive** (Workers, KV, R2, Durable Objects) when the workload is request-shaped and globally
distributed, and **pair Cloudflare with a hyperscaler** (Hyperdrive fronting an external database, R2
replacing S3, Workers in front of a regional origin) when the workload needs what the edge doesn't
have: VMs, GPUs, managed Kubernetes, or a large single-region OLTP database. As everywhere, tie the
choice to the access pattern, never the brand name.

**Distinctive strengths** (for cross-cloud decisions): one global anycast network — no regions,
zones, or VPCs to design, and DDoS/WAF as the company's core competency; **zero-egress** object
storage (R2); **Durable Objects**, a strongly-consistent stateful-compute-plus-storage primitive
with no real equivalent on the big three; near-zero cold starts (V8 isolates rather than
containers/VMs); and consumption pricing that scales to zero. Be equally honest about the gaps: no
VMs or managed Kubernetes, no managed relational OLTP at hyperscaler scale (D1 favors many small
databases over one giant one), no managed pub/sub event bus, and no consumer CIAM.

**Model & naming watch:** Cloudflare has **no VMs, no managed Kubernetes, and no regional
VPC/subnets** — the mental model is "code and data at every edge," not "a region you provision."
Workers KV is **eventually consistent**; reach for Durable Objects or D1 when a read must see the
latest write. Recent renames: **AutoRAG → AI Search** · **Magic WAN → Cloudflare WAN** (Magic Transit
keeps its name). **Pages** is converging into Workers — build new full-stack projects on Workers with
Static Assets.

## Compute

| Service | Use when |
|---|---|
| **Workers** | The default: serverless JS/TS/Python/WASM on V8 isolates, running in every POP with near-zero cold start. Request/response, APIs, edge glue, transforms. Watch the per-request CPU-time limit — not for long CPU-bound batch jobs. |
| **Durable Objects** | You need a *single* strongly-consistent owner for a key: coordination, real-time collaboration, per-entity state, WebSocket hubs, locks. Each object is single-threaded (a natural mutex) with colocated transactional SQLite (≤10 GB) and WebSocket hibernation. The primitive with no big-three equivalent. |
| **Containers** | A workload that doesn't fit the isolate model — native dependencies, a heavier runtime, existing Docker images. Runs alongside a Worker, controlled through a Durable Object; instance sizes `lite`→`standard-4`; regional and jurisdictional (`eu`, `fedramp`) placement. |
| **Workers for Platforms** | You run *your customers'* code — isolated per-tenant Worker namespaces for a SaaS platform. |

Decision: **Workers** for nearly all request-shaped and glue compute → **Durable Objects** when a key
needs one consistent owner or live coordination → **Containers** when you need a real container
(native deps, GPU-less heavy compute, an existing image) → pair with a hyperscaler for VMs, GPUs, or
managed Kubernetes. **Smart Placement** relocates a Worker nearer a back-end it talks to a lot (e.g.
a central database) when that cuts total round-trip latency — the edge default isn't always the
fastest placement.

## Storage

| Service | Use when |
|---|---|
| **R2** | Object storage — blobs, media, backups, data lakes, static assets — with an S3-compatible API and **no egress fees** (the headline cost story vs S3). Adds R2 Data Catalog (managed Apache Iceberg) queryable by R2 SQL. The default "where do big files live" answer on Cloudflare. |
| **Workers KV** | Read-optimized, globally replicated key-value for data that is read far more than written and tolerates seconds of propagation: config, routing metadata, feature flags, A/B assignments. **Eventually consistent** — not for counters or read-your-writes. |
| **Cache API / Tiered Cache / Cache Reserve** | The CDN cache, programmable from a Worker: cache computed responses at the edge, add an upper tier to raise hit ratio, or persist to Cache Reserve. |

Decision: large files / blobs → **R2** (and drop the egress bill); read-mostly config → **Workers
KV**; per-object transactional state → **Durable Objects** storage (see Databases); cached HTTP
responses → **Cache API**.

## Databases

| Service | Use when |
|---|---|
| **D1** | Serverless SQLite relational database — batteries included (migrations, HTTP API, query insights, read replication). Relational app data at edge scale. Per-database size limits favor **many small databases** (one per tenant/user) over a single monolithic OLTP database. |
| **Durable Objects (SQLite)** | Strongly-consistent, transactional storage colocated with single-threaded compute, scoped to one object. Reach for it when consistency and coordination matter more than raw relational surface — the stateful primitive, not a general query database. |
| **Hyperdrive** | You have an **existing** Postgres/MySQL (on a hyperscaler or on-prem) and want it fast from Workers: connection pooling + query caching that hides origin latency and connection limits. A bridge to a hyperscaler OLTP database, not a database itself. |
| **Vectorize** | Vector database for embeddings — semantic search, classification, and the retrieval half of RAG. |
| **R2 SQL** | Serverless, distributed query engine over Iceberg tables in R2 Data Catalog — read-only analytics over petabytes without moving the data. The Athena/BigQuery analog (Cloudflare prices it per TB scanned). |
| **Analytics Engine** | High-cardinality time-series written from Workers and queried with SQL — usage metrics, service telemetry. |

Decision: relational at edge scale → **D1** (lean to many small DBs); a large or existing OLTP
database → keep it on a hyperscaler and accelerate it with **Hyperdrive**; a key that needs one
strongly-consistent owner → **Durable Objects**; vectors/RAG retrieval → **Vectorize**; analytics
over data in R2 → **R2 SQL**; app-emitted metrics → **Analytics Engine**.

## Messaging & streaming

| Service | Use when |
|---|---|
| **Queues** | At-least-once message queue: batching, retries, delays, dead-letter queues, pull or Worker (push) consumers. Background jobs, decoupling producers from consumers, absorbing spikes. Point-to-point. |
| **Pipelines** | Streaming ingestion at volume: **Streams** buffer events (HTTP or Worker binding) → **Pipelines** apply SQL transforms → **Sinks** land Iceberg/Parquet in R2. Clickstream, telemetry, and logs that you then query with R2 SQL. |

Decision: decouple or defer work → **Queues** (add a DLQ for poison messages); high-volume event or
telemetry ingestion you'll analyze later → **Pipelines** → R2 (query with R2 SQL); real-time fan-out
to connected clients → **Durable Objects** + WebSockets. There is **no managed pub/sub event bus**
(no SNS/EventBridge analog) — build fan-out with a Worker writing to several Queues, or a Durable
Object broadcasting to subscribers.

## API, edge & CDN

| Service | Use when |
|---|---|
| **CDN / Cache** | Cache and serve content from 300+ POPs on anycast, absorbing spikes and DDoS; Tiered Cache and Cache Reserve raise hit ratio. The original product. |
| **Workers** | The programmable edge front door: routing, auth, request/response transforms, API composition. Unlike a config-only rules engine, Workers run **arbitrary code** at every POP. |
| **API Shield** | API security as the gateway layer: schema validation, mTLS, JWT validation, rate limiting, and endpoint discovery. |
| **Load Balancing** | Health-checked steering across origins (geo, latency, weighted, failover) on the global anycast network. |
| **Waiting Room** | Protect an origin during traffic spikes with a virtual waiting room that admits users at a controlled rate. |

Decision: content delivery → **CDN/Cache**; a programmable API front door → **Workers** (+ **API
Shield** for schema/mTLS/quotas); multi-origin steering and failover → **Load Balancing**; sudden
spikes that would overwhelm the origin → **Waiting Room**.

## Networking

| Service | Use when |
|---|---|
| **DNS** | Authoritative anycast DNS — among the fastest globally — with DNSSEC. Routing is handled by anycast + Load Balancing, not DNS-TTL tricks. |
| **Spectrum** | Extend Cloudflare's DDoS protection and proxying to **non-HTTP** L4 TCP/UDP traffic (SSH, mail, gaming, custom protocols). |
| **Argo Smart Routing** | Route traffic across Cloudflare's private backbone along faster, less-congested paths than the public internet. |
| **Cloudflare Tunnel** (`cloudflared`) | Reach a private origin with **no open inbound ports** — an outbound-only, post-quantum-encrypted tunnel to Cloudflare. Pair with **Workers VPC** to let Workers call private services. |
| **Magic Transit / Cloudflare WAN** | Network-layer (L3): scrub a whole network's traffic for DDoS (Magic Transit), or connect sites and clouds as a WAN (Cloudflare WAN, formerly Magic WAN). |

Decision: authoritative DNS → **Cloudflare DNS**; global HTTP entry → **Load Balancing** (already
anycast — no DNS steering needed); non-HTTP L4 → **Spectrum**; reach a private origin without opening
ports → **Tunnel** (+ **Workers VPC** for Worker-to-private); protect or interconnect whole networks
→ **Magic Transit / Cloudflare WAN**. Everything is **global anycast by default** — there are no
regions, subnets, or VPCs to lay out (see `references/networking-os.md`).

## Observability

| Service | Use when |
|---|---|
| **Workers Observability** | Built-in logs, metrics, invocations, and errors for Workers, queryable in the dashboard. The default. |
| **Logpush** | Push zone/account logs (HTTP, security, Workers) to R2, S3, GCS, BigQuery, Splunk, and other sinks for retention and analysis. |
| **GraphQL Analytics API / Web Analytics** | Query traffic, cache, and security analytics; privacy-first real-user monitoring. |
| **Health Checks** | Standalone origin health monitoring and alerting, independent of Load Balancing. |

## Identity & security

| Service | Use when |
|---|---|
| **Access** (Cloudflare One / Zero Trust) | Identity-first (ZTNA) access to **internal** apps and infrastructure: SSO/IdP federation, device posture, per-app policy. For your team and private apps — **not** consumer sign-up (there is no Cognito/Identity-Platform CIAM analog). |
| **Gateway** | Secure Web Gateway: DNS, HTTP, and network filtering for **outbound** traffic, with WARP as the device client. |
| **WAF + DDoS Protection** | Managed and custom L7 rules, OWASP core ruleset, rate limiting; automatic, unmetered L3–L7 DDoS mitigation. The public-web attack-surface default. |
| **Turnstile** | A CAPTCHA alternative — verify a visitor is human without puzzles. |
| **Bot Management / API Shield / Page Shield** | Bot scoring / API security (schema, mTLS, discovery) / client-side (Magecart, supply-chain) protection. |
| **Secrets Store / Workers secrets** | Account-level secrets bound into Workers, plus per-Worker secret bindings. |

Decision: access to internal apps/infra → **Access** (ZTNA); outbound web filtering → **Gateway**;
public web attack surface → **WAF + DDoS + Bot Management**; human/bot check on a form → **Turnstile**;
secrets → **Secrets Store**. Workload identity is narrower than a hyperscaler's: **service bindings**
(Worker-to-Worker or Worker-to-Durable-Object with no network hop and no public credentials) plus
scoped **API tokens**, rather than an IAM-role-per-resource model.

## AI / ML & generative AI

| Service | Use when |
|---|---|
| **Workers AI** | Serverless GPU inference over a managed model catalog (Llama, embeddings, image, speech…) plus partner models — pay-per-use, running at the edge. The default for adding model capability. |
| **AI Gateway** | A proxy in front of **any** model provider (Workers AI, OpenAI, Anthropic…): caching, rate limiting, retries/fallback, logging, cost analytics, and **Guardrails** content moderation. Front every model call with it. |
| **Vectorize** | Vector database for embeddings — the retrieval store for semantic search and RAG. |
| **AI Search** (formerly AutoRAG) | Fully-managed RAG: point it at an R2 bucket and it handles embeddings, indexing, retrieval, and generation behind one API. |
| **Agents SDK** (`agents`) | Build stateful, tool-using AI **agents** on Workers + Durable Objects: per-session state, WebSockets, scheduling, tool calls, and `MCPAgent` for hosting MCP servers. → see `references/agentic-ai.md`. |
| **Browser Rendering** | Headless Chromium (Puppeteer/Playwright) from a Worker — scraping, screenshots, PDF generation, agent browsing. |

Decision: run inference → **Workers AI**; govern, cache, and observe calls to any model →
**AI Gateway**; store vectors → **Vectorize**; turnkey RAG over your documents → **AI Search**; a
stateful, tool-using agent in production → **Agents SDK** (Durable Objects give each session its
memory); a headless browser as a tool → **Browser Rendering**.

## Workflow orchestration

| Service | Use when |
|---|---|
| **Workflows** | Durable execution on Workers: multi-step pipelines with automatic retries, `sleep` for seconds to weeks, and state persisted across steps and restarts. The Step Functions / Durable Functions / Cloud Workflows analog — for sagas, long-running jobs, and human-in-the-loop. |
| **Cron Triggers** | Fire a Worker on a schedule (cron). |
| **Queues** | Decouple or defer steps between stages (see Messaging). |

Decision: multi-step durable orchestration with retries, long sleeps, and compensation → **Workflows**;
scheduled jobs → **Cron Triggers**; deferred or fan-out steps → **Queues**.

## Mapping a generic component to a service

When you've sketched the architecture in role terms, this is the translation table:

| Generic component | Cloudflare service(s) |
|---|---|
| Load balancer | Load Balancing (anycast L7) · Spectrum (L4) |
| Application / compute tier | Workers · Durable Objects · Containers |
| Relational database | D1 (SQLite) · Hyperdrive (accelerate external Postgres/MySQL) |
| NoSQL / key-value store | Workers KV (eventual) · Durable Objects (strongly consistent) |
| Cache | Cache API / Tiered Cache · Workers KV |
| Object / blob storage | R2 (zero egress) |
| Message queue | Queues |
| Pub/sub | — (no managed bus; fan-out via Workers/Queues or Durable Objects) |
| Event stream / ingestion | Pipelines (→ R2) |
| Stream processing | Pipelines (SQL at ingest) |
| API gateway | Workers · API Shield |
| CDN / edge | Cloudflare CDN + Workers |
| DNS | Cloudflare DNS |
| Search | Vectorize (vector) · — (no managed full-text) |
| Data warehouse / analytics | R2 SQL (Iceberg on R2) · Analytics Engine (time-series) |
| Workflow orchestration | Workflows · Cron Triggers |
| Monitoring / logging | Workers Observability · Logpush · GraphQL Analytics |
| Auth | Access (ZTNA, internal apps) · service bindings (workload) |
| Secrets / keys | Secrets Store · Workers secrets |
| Vector store (RAG) | Vectorize · AI Search (managed RAG) |
| ML / recommendations | Workers AI (inference) |
| Generative AI / LLM | Workers AI · AI Gateway (govern any provider) |
| AI agents at scale | Agents SDK (on Workers + Durable Objects) |
| Media (video / images) | Stream · Images |
| Email | Email Service (Sending + Routing) |
