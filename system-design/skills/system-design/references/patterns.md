# Distributed-Systems Patterns

The building blocks for step 3 (sketch the architecture). For each: what it is, when to reach for
it, the catch, and the service that provides it on each cloud (**AWS · Azure · GCP**, in that order
throughout). Pick the fewest patterns that meet the requirements — each one is also a source of
complexity and failure.

**Contents:** Scaling · Load balancing · Caching · Partitioning & sharding · Replication & failover ·
Messaging (queues vs pub/sub) · API gateway · CDN / edge · Microservices vs monolith · Serverless ·
Consistency & CAP · Locking & coordination · Rate limiting & backpressure · Event-driven
architecture · Saga (distributed transactions) · Event sourcing & CQRS · Reliable-messaging
building blocks · Serverless anti-patterns.

## Scaling: horizontal vs vertical

- **Vertical (scale up):** bigger instance (more CPU/RAM). Simple, no app changes, but a hard ceiling and often downtime to resize. Fine early, or for stateful single-node stores.
- **Horizontal (scale out):** more instances behind a load balancer. Near-unbounded and fault-tolerant, but requires statelessness (or externalized state) and load balancing. Every vendor's Well-Architected default for availability.
- **Rule:** scale up until it's expensive or hits a ceiling, then scale out. Make compute **stateless** early so scaling out stays cheap — push session/state to a cache or KV store (ElastiCache/DynamoDB · Managed Redis/Cosmos DB · Memorystore/Firestore).

## Load balancing

Distributes traffic across instances; provides health checks and failover. Layer 7 routes on HTTP
(path/host); Layer 4 routes on TCP/UDP with lower latency. Algorithms: round-robin, least
connections, hashing. **Stateless backends** make this trivial; if you need stickiness, prefer an
external session store over sticky sessions.
→ L7: ALB · Application Gateway (regional) / Front Door (global) · global external Application LB.
L4: NLB · Load Balancer · Network LB. DNS-level/global routing: Route 53 · Traffic Manager · Cloud
DNS policies (GCP usually doesn't need it — the L7 LB is already global anycast).

## Caching

Store hot data in fast memory to cut latency and offload the backend.
- **Patterns:** cache-aside (app checks cache, then DB, then populates — most common), write-through (write to cache + DB together), write-back (write to cache, async to DB — fast but risks loss).
- **The hard parts:** invalidation (stale data) and consistency. Set TTLs; invalidate on write; accept bounded staleness where you can.
- **Where:** client → CDN (edge) → app-tier cache → DB-embedded cache. Cache at the layer closest to the reader that tolerates the staleness.
→ App tier: ElastiCache (+ DAX for DynamoDB) · Azure Managed Redis · Memorystore. Edge: CloudFront ·
Front Door · Cloud CDN.

## Partitioning & sharding

Split data across nodes so no single node holds (or serves) it all — the way past a single machine's
capacity.
- **Strategies:** hash-based (even spread, but range scans are hard), range-based (good for ranges, risks hot partitions), directory/lookup (flexible, adds a lookup hop).
- **Consistent hashing** minimizes reshuffling when nodes are added/removed — the standard for caches and distributed stores.
- **The catch:** cross-shard queries/transactions are expensive; a bad shard key creates **hot partitions**. Choose the shard key for even distribution *and* the dominant query.
→ DynamoDB partition key · Cosmos DB partition key (a hot logical partition also burns RUs — cost,
not just latency) · Bigtable row key / Spanner primary key (avoid monotonically increasing keys —
they hotspot the last range). Managed relational read-scaling: Aurora · Azure SQL Hyperscale ·
AlloyDB read pools.

## Replication & failover

Keep copies of data on multiple nodes for availability and durability.
- **Sync replication:** strong consistency, higher write latency. **Async:** lower latency, risk of lost writes on failover, replica lag.
- **Topologies:** primary/replica (writes to primary, reads scale on replicas), multi-primary (write anywhere, conflict resolution needed).
- **Failover:** promote a replica when the primary dies — automatic with health checks. Always **across zones** for real fault tolerance.
→ In-region + failover: Aurora multi-AZ (up to 15 replicas) · Azure SQL zone redundancy / failover
groups · Cloud SQL HA, AlloyDB. Multi-region: DynamoDB global tables, Aurora Global Database, Aurora
DSQL (active-active SQL) · Cosmos DB multi-region writes · Spanner multi-region (sync,
strongly consistent), Firestore multi-region.

## Messaging: queues vs pub/sub

Asynchronous, decoupled communication — the backbone of resilient systems.
- **Queue (point-to-point):** one message → one consumer; decouples producer/consumer speed, smooths bursts, enables retries. Add a **dead-letter queue** for poison messages. → SQS · Service Bus · Pub/Sub (or Cloud Tasks for rate-controlled dispatch).
- **Pub/sub (fan-out):** one message → many subscribers. → SNS / EventBridge · Event Grid · Pub/Sub.
- **Stream (log):** ordered, replayable, retained for multiple independent consumers. → Kinesis / MSK · Event Hubs (Kafka-compatible) · Pub/Sub (retention + seek) / Managed Kafka.
- **Queue vs stream:** a queue *deletes* on consume; a stream *retains* for replay. Need replay or multiple consumers reading at their own pace → stream. Just decoupling work → queue. (On GCP, Pub/Sub covers both — it's a subscription-configuration choice, not a service choice.)

## API gateway

Single entry point for clients: routing, composition, auth, rate limiting, throttling, protocol
translation. Decouples clients from backend topology. → API Gateway (GraphQL: AppSync) · API
Management · API Gateway / Apigee — or plain L7 LB when you need none of the API features.

## CDN / edge

Cache and serve content from POPs close to users — cuts latency, offloads origin, absorbs spikes,
terminates TLS, anchors WAF. Essential for static assets and global audiences; can cache dynamic
content with short TTLs. → CloudFront (edge code: Lambda@Edge / CloudFront Functions) · Front Door
(rules engine — config, not arbitrary code) · Cloud CDN (Service Extensions for edge logic).

## Microservices vs monolith

- **Monolith:** one deployable. Simplest to build, test, and reason about; the right call until team
  size or scaling needs force a split. Don't apologize for it at modest scale.
- **Microservices:** independently deployable services. Independent scaling and team ownership, but
  buys you distributed-systems problems (network calls, data consistency, observability, ops overhead).
- **Rule:** start monolith, extract services when a clear seam and a real scaling/ownership need appear.
  Microservices for a small system is over-engineering (a step-5 failure).
→ Per-service compute: ECS/EKS/Lambda · Container Apps/AKS/Functions · Cloud Run/GKE. Between them:
EventBridge/SQS · Event Grid/Service Bus · Pub/Sub.

## Serverless

No server management; event-driven; auto-scaling; pay-per-use. Great for spiky/unpredictable load,
glue code, and getting to market fast. Watch: cold starts, execution/time limits, per-invocation
cost at very high steady volume (a busy 24/7 service can be cheaper on flat-rate containers).
→ Lambda, Fargate, API Gateway, DynamoDB, S3, Step Functions · Functions, Container Apps, APIM,
Cosmos DB, Blob Storage, Durable Functions · Cloud Run (+functions), API Gateway, Firestore, Cloud
Storage, Workflows.

## Consistency & the CAP theorem

Under a network **partition (P)** you must choose **consistency (C)** or **availability (A)** — you
can't have both while partitioned. In practice it's a spectrum:
- **Strong consistency:** every read sees the latest write. Needed for money, inventory, uniqueness. Costs latency/availability.
- **Eventual consistency:** replicas converge over time. Fine for feeds, counts, caches, social data — and it buys availability and scale.
- **PACELC** extends it: even when there's no partition (E), you trade latency (L) vs consistency (C).
- **Design move:** pick consistency *per data type*, not per system. Order state strong; like-count eventual.
→ The knobs differ per cloud and enrich the design: DynamoDB chooses per *read* (eventual vs
strong); Cosmos DB offers **five levels** (strong, bounded staleness, session, consistent prefix,
eventual) per account/request — session is the sweet spot for user-facing apps; Spanner is strongly
consistent always (external consistency) and pays for it in write latency and cost; Firestore is
strongly consistent too, including in multi-region configurations.

## Locking & coordination

- **Optimistic** (version number/CAS, retry on conflict): high concurrency, low contention. Default for most web workloads. → DynamoDB conditional writes · Cosmos DB ETags / optimistic concurrency · Firestore transactions, GCS `ifGenerationMatch` preconditions.
- **Pessimistic** (acquire lock before acting): correctness under high contention, but reduces concurrency and risks deadlock.
- **Distributed locks** (coordinate across nodes): use a purpose-built coordinator — keep them short-lived and fenced. → DynamoDB lock item / Redis (Redlock — know its caveats) · **Blob leases** (Azure's classic built-in lock) · Firestore lock doc / Redis. ZooKeeper/etcd when you're already running them.
- **Idempotency** often beats locking: design operations so a retry is harmless (idempotency keys), and you avoid coordinating at all.

## Rate limiting & backpressure

Protect the system from overload and abuse. Algorithms: **token bucket** (allows bursts), **leaky
bucket** (smooths), **fixed/sliding window** (simple counts). Enforce at the edge and return 429s
with `Retry-After`. Pair with **exponential backoff + jitter** on the client. Counters live in a
fast shared store (Redis/Valkey INCR + TTL on any cloud).
→ Edge/managed: API Gateway throttling + WAF rate rules · API Management policies + Front Door WAF ·
Apigee quotas / Cloud Armor rate limiting. Counters: ElastiCache · Managed Redis · Memorystore.

## Event-driven architecture (EDA)

Services communicate by emitting and reacting to events rather than calling each other directly —
loose coupling, independent scaling, and resilience (a down consumer doesn't fail the producer). The
cost is eventual consistency and harder end-to-end tracing. Distinguish **domain events** (business
facts — `OrderPlaced`) from **system events** (`ObjectCreated`). Define an explicit **event
contract/schema** per event so producers and consumers can evolve independently; version events and
tolerate unknown fields.

- **Routing:** content-based routing and filtering on event attributes — the consumer subscribes to what it cares about, the producer doesn't know who listens. → EventBridge rules · Event Grid filters · Eventarc filters / Pub/Sub subscription filters.
- **Enrichment / transformation:** a step that augments a thin event with looked-up data before downstream consumers see it.
- **Archive & replay:** retain events to rebuild state or reprocess after a bug fix. → EventBridge archive+replay · Event Hubs retention (Event Grid dead-letters to storage; replay is yours) · Pub/Sub snapshots + seek.
→ Buses/fan-out: EventBridge, SNS · Event Grid · Pub/Sub, Eventarc. Orchestration when flows need
supervising: Step Functions · Durable Functions / Logic Apps · Workflows.

## Distributed transactions: the saga pattern

You can't hold an ACID transaction across services/databases. A **saga** is a sequence of local
transactions, each with a **compensating action** to undo it if a later step fails (refund payment,
release inventory). The steps are coordinated either by services reacting to each other's events
(choreography) or by a central coordinator issuing commands (orchestration):

| | Choreography | Orchestration |
|---|---|---|
| Coordination | Decentralized — services react to each other's events | Central coordinator drives the steps |
| Coupling | Looser | Tighter |
| Visibility | Distributed logs (harder to trace) | Single execution history (easier) |
| Best for | Simple, few-step flows | Complex flows with many branches/compensations |

→ Choreography via the event bus (EventBridge/SNS · Event Grid · Pub/Sub); orchestration via Step
Functions · Durable Functions (orchestrator functions are exactly this) / Logic Apps · Workflows —
all with built-in retry/catch for compensation branches. Reach for orchestration once the
compensation logic gets non-trivial.

## Event sourcing & CQRS

- **Event sourcing:** store the *sequence of events* as the source of truth, not just current state. Rebuild state by replaying events; get a full audit trail and time-travel for free. Use **snapshots** to bound replay cost. Fits audit-heavy/financial domains; overkill for simple CRUD.
- **CQRS** (Command Query Responsibility Segregation): separate the write model from read-optimized **materialized views**, updated asynchronously from the event stream. Lets reads and writes scale and be shaped independently — pairs naturally with event sourcing.
→ Event store + change feed → projector → read models: DynamoDB (partition = aggregate id, sort =
version; conditional write for concurrency) + Streams → Lambda · Cosmos DB + **change feed** →
Functions (the textbook Azure version) · Firestore/Spanner + change streams → Cloud Run.

## Reliable messaging building blocks

The patterns that make async systems correct under retries and failure — apply these whenever you
use a queue, stream, or event bus:

- **Idempotency:** make handlers safe to run twice (at-least-once delivery *will* redeliver). Record an idempotency key (request/message id) in a store with a conditional write; on a duplicate, return the prior result instead of reprocessing.
- **Deduplication:** SQS FIFO content-based dedup · Service Bus duplicate detection (built in) · Pub/Sub exactly-once delivery (regional) — or a manual dedup table with a TTL.
- **Dead-letter queues (DLQ):** route messages that fail repeatedly to a DLQ for inspection instead of blocking the queue or losing them. Alarm on DLQ depth. → SQS DLQ · Service Bus DLQ (built in) · Pub/Sub dead-letter topics.
- **Transactional outbox:** to publish an event *and* commit a DB write atomically, write both in one transaction (the event into an "outbox" table), then a stream/poller publishes the outbox row. Avoids the dual-write problem. → DynamoDB `TransactWriteItems` + Streams · Cosmos DB transactional batch + change feed · Firestore/Spanner transaction + change streams.
- **Ordering:** strict order serializes a partition — SQS FIFO `MessageGroupId` · Service Bus sessions · Pub/Sub ordering keys / one Kinesis shard. Order is a throughput tax; only pay it where order actually matters.
- **Circuit breaker:** stop hammering a failing dependency — trip open after N consecutive failures, fail fast, periodically probe to recover. Protects against cascading failure and runaway retries. (Library/app-level pattern on every cloud; service meshes and API gateways can enforce it.)

## Serverless anti-patterns

Common serverless designs that look reasonable and bite later — call these out in a review (step 5).
Named for functions, but they apply to any FaaS (Lambda · Azure Functions · Cloud Run functions):

- **Function monolith:** one function with a giant `switch` over operations. Loses per-operation scaling, least-privilege, and observability. → one function per operation/route.
- **Recursive function:** a function that invokes *itself* to iterate — a runaway-cost and concurrency hazard. → drive iteration with a queue or an orchestrator (SQS/Step Functions · Service Bus/Durable Functions · Cloud Tasks/Workflows).
- **Function chaining:** function A directly invokes function B synchronously, paying for A to sit idle while B runs and coupling the two. → decouple via events/queues, or sequence with the orchestrator.
- **Synchronous everything:** blocking on every downstream call. → push slow/non-critical work onto async paths so the user-facing request returns fast.
