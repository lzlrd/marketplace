# Worked Examples

Condensed end-to-end designs that follow this skill's six-step loop, so there's a model to
pattern-match against. They're deliberately terse — the *shape* of the reasoning is the lesson, not
exhaustive detail. Architectures are in role terms; each ends with the service mapping per cloud
(**AWS · Azure · GCP**), with a **Cloudflare** line on the designs that are edge-native (the rest fit
an edge-first platform poorly, and forcing a mapping would be exactly the trap step 4 warns against).
For a real request, expand the relevant one with the user's actual numbers, map to *their* cloud, and
run the full Well-Architected gate. If the user's `Interview Prep` workspace is available, fuller
treatments (16 designs) live in its `Systems Design 101.md`.

## Table of contents
1. URL shortener
2. Distributed key-value store
3. News feed
4. Distributed messaging system
5. Rate limiter
6. Notification fan-out
7. Metric monitoring system

---

## 1. URL shortener

- **Requirements:** shorten a long URL → short code; redirect code → original. Read-heavy, low latency on redirect, highly available, codes never collide. Optional: custom aliases, expiry, click analytics.
- **Estimate:** (see `references/estimation.md` worked example) 100M writes/day → ~1K write QPS / ~100K read QPS; ~270 TB over 5 yrs ×3 replication; hot cache ~500 MB.
- **Architecture:** client → CDN/edge → API gateway → stateless handler. Write path: generate code (base-62 of a counter, or hash+collision-check), store mapping in a KV store. Read path: cache lookup → KV lookup → 301/302 redirect, served from cache/edge wherever possible. Async click-event stream → object store for analytics.
- **Mapping:** AWS — DynamoDB · ElastiCache · CloudFront · API GW + Lambda · Kinesis → S3. Azure — Cosmos DB · Managed Redis · Front Door · APIM + Functions · Event Hubs → Blob/OneLake. GCP — Firestore · Memorystore · Cloud CDN + global LB · Cloud Run · Pub/Sub → BigQuery (analytics lands queryable for free). Cloudflare — Workers KV or D1 for the mapping · Cache API at the edge · a Worker on the redirect path · click events → Pipelines → R2 (query with R2 SQL). The textbook edge fit: the redirect is served from the nearest POP, often without touching an origin.
- **WA review:** Reliability — multi-zone KV store, no SPOF. Performance — cache + edge for read latency. Cost — serverless scales to zero. Security — validate input URLs, rate-limit creation (edge WAF).
- **Tradeoffs / bottleneck:** counter-based codes need a distributed counter (or pre-allocated ranges per node) to avoid a write bottleneck; hashing avoids that but must handle collisions. Read path is cache-bound — cache hit ratio is the metric that matters.

## 2. Distributed key-value store

- **Requirements:** get/put by key at scale; pick a point on the consistency/availability spectrum; durable; horizontally scalable.
- **Estimate:** size from key count × value size × replication; decide if the working set is memory- or disk-resident.
- **Architecture:** clients → request coordinator → **consistent-hashing ring** of storage nodes; each key replicated to N successor nodes; quorum reads/writes (R + W > N) for tunable consistency; gossip for membership; vector clocks / last-write-wins for conflict resolution.
- **Mapping:** the managed answer is the cloud's KV service — DynamoDB (this *is* Dynamo's design) · Cosmos DB (five consistency levels = the R/W-quorum dial, productized) · Firestore or Bigtable (Bigtable for raw throughput). Self-managed: VM ring + in-memory tier; object store for snapshots.
- **WA review:** Reliability — replication + quorum survive node loss. Performance — consistent hashing spreads load, minimizes reshuffle on membership change. Security — encrypt at rest (KMS/Key Vault/Cloud KMS), platform IAM.
- **Tradeoffs / bottleneck:** the CAP choice is the whole design — quorum (R+W>N) buys strong-ish consistency at latency cost; lower R/W buys availability with staleness. Hot keys break even distribution → mitigate with key salting or caching.

## 3. News feed

- **Requirements:** users post; followers see a feed; low-latency feed reads; scale to celebrity fan-out. Read-heavy.
- **Architecture — the fan-out decision:**
  - **Fan-out on write (push):** precompute each follower's feed at post time → fast reads, but a celebrity with 10M followers triggers 10M writes.
  - **Fan-out on read (pull):** assemble the feed at read time from followees → cheap writes, expensive reads.
  - **Hybrid (the real answer):** push for normal users, pull for celebrities, merge at read. This is the key insight.
- **Mapping:** posts/feed entries in the KV store (DynamoDB · Cosmos DB · Firestore/Bigtable) · materialized hot feeds in cache (ElastiCache · Managed Redis · Memorystore) · async fan-out workers off a queue/stream (SQS/Kinesis · Service Bus/Event Hubs · Pub/Sub) · media on object store + CDN (S3+CloudFront · Blob+Front Door · GCS+Cloud CDN).
- **WA review:** Performance — precomputed feeds in cache for read latency. Reliability — async fan-out via queue decouples post latency from fan-out cost. Cost — hybrid avoids the celebrity write storm.
- **Tradeoffs / bottleneck:** write amplification vs read latency is the core tradeoff; the hybrid exists precisely to bound the worst case. Feed consistency is eventual — acceptable here.

## 4. Distributed messaging system

- **Requirements:** producers send, consumers receive; choose queue vs pub/sub; ordering and delivery guarantees; durability/retention; replay?
- **Architecture:** brokers partition topics across nodes; each partition replicated; producers write to partition (by key for ordering); consumers track offsets; retention window enables replay.
- **Mapping:** decouple work → SQS (+DLQ; FIFO for ordering) · Service Bus (sessions, dedup built in) · Pub/Sub (ordering keys). Fan-out → SNS/EventBridge · Event Grid · Pub/Sub. Ordered replayable stream → Kinesis/MSK · Event Hubs (Kafka-compatible) · Pub/Sub seek / Managed Kafka.
- **WA review:** Reliability — replication + DLQ for poison messages. Performance — partitioning for throughput. Operational — monitor queue depth / consumer lag (the health signal).
- **Tradeoffs / bottleneck:** ordering vs throughput (strict ordering serializes a partition); at-least-once (needs idempotent consumers) vs exactly-once (expensive). Queue (delete on consume) vs stream (retain for replay) is the first fork — on GCP it's a Pub/Sub configuration rather than a service choice.

## 5. Rate limiter

- **Requirements:** cap requests per client per window; low added latency; distributed across many API nodes; fail open or closed (a choice — closed is safer for abuse, open is safer for availability).
- **Architecture:** shared counter store keyed by client+window; algorithm = **token bucket** (allows bursts) or **sliding window** (smoother); check-and-decrement on each request; return **429 + Retry-After** when exceeded. Enforce at the edge so bad traffic dies early.
- **Mapping:** managed throttling first — API Gateway usage plans + WAF rate rules · APIM rate-limit policies + Front Door WAF · Apigee quotas + Cloud Armor · Cloudflare WAF Rate Limiting. Custom distributed counters: Redis/Valkey atomic INCR + TTL (ElastiCache · Managed Redis · Memorystore), or a Durable Object as a single-owner atomic counter at the edge — no external store or network hop.
- **WA review:** Performance — counter in memory, sub-ms. Reliability — decide fail-open vs fail-closed explicitly. Security — protects the system from abuse/DDoS.
- **Tradeoffs / bottleneck:** accuracy vs cost — a per-node local limiter is fast but lets bursts through; a shared store is accurate but adds a network hop. The counter store is the SPOF — replicate it.

## 6. Notification fan-out (push / email / SMS)

- **Requirements:** one event → notify many users across channels (push, email, SMS); reliable delivery; retries; user preferences; scale to spikes.
- **Architecture:** event → pub/sub topic → fan-out to per-channel queues → channel workers → providers (APNs/FCM, email, SMS). Queues absorb spikes and isolate slow/failing channels; DLQ for undeliverable; prefs + idempotency keys in a KV store.
- **Mapping:** AWS — SNS → SQS → Lambda; SES email; DynamoDB prefs. Azure — Event Grid → Service Bus queues → Functions; Communication Services (email/SMS/push); Cosmos DB prefs. GCP — Pub/Sub topic → per-channel subscriptions → Cloud Run; Firebase Cloud Messaging for push, partner email/SMS (SendGrid/Twilio); Firestore prefs. Cloudflare — a Worker fans out to per-channel Queues → consumer Workers; Email Service for email, partner APIs for SMS/push; prefs in KV or D1 (no managed pub/sub bus, so the fan-out is explicit).
- **WA review:** Reliability — queues + DLQ + retries; one bad channel doesn't block others. Operational — monitor per-channel queue depth and delivery rate. Cost — serverless scales with volume.
- **Tradeoffs / bottleneck:** at-least-once delivery means duplicates → dedup with idempotency keys. Provider rate limits are the real bottleneck → the queue is what makes that survivable.

## 7. Metric monitoring system

- **Requirements:** ingest metrics from many sources at high volume; store time-series; query/aggregate; alarms; dashboards; retention policy (high-res recent, downsampled old).
- **Architecture:** agents → ingestion (stream) → stream processor (aggregate/rollup) → **time-series store** → query/alarm/dashboard layer. Downsample old data to control storage; tier cold data to object storage.
- **Mapping:** AWS — Kinesis/MSK → Managed Flink → DynamoDB or Timestream for InfluxDB → CloudWatch/Managed Grafana; S3 cold. Azure — Event Hubs → Stream Analytics → Data Explorer (built for exactly this) → Managed Grafana; Blob cold. GCP — Pub/Sub → Dataflow → Bigtable (the classic time-series pick) or BigQuery → Cloud Monitoring/Grafana; GCS cold.
- **WA review:** Performance — partition by metric/source; time-series store matches the access pattern. Reliability — stream buffers ingestion spikes. Cost — tiered retention (hot → warm → object-store cold).
- **Tradeoffs / bottleneck:** write volume is enormous → pre-aggregate at ingestion, don't store every raw point forever. Cardinality (unique metric dimensions) is the silent killer — it explodes storage and query cost; bound it.

---

**The throughline across all seven:** pin requirements → let the estimate pick the shape → simplest
architecture that fits, in role terms → managed service per component *on the target cloud* with a
stated reason → validate against the pillars → name the one tradeoff and the one bottleneck that
define the design. Same loop every time, whichever cloud catches it.
