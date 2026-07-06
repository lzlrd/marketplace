---
name: system-design
description: >
  Design real-world systems on AWS, Azure, Google Cloud, or Cloudflare — or cloud-neutrally —
  grounded in the vendors' Well-Architected frameworks. Use whenever the user wants to architect,
  design, or scale a system; asks which cloud service to use, within one cloud (SQS vs Kinesis,
  Cloud Run vs GKE, Workers vs Containers) or across clouds (DynamoDB vs Cosmos DB vs Firestore,
  S3 vs R2, Lambda vs Workers); wants an architecture, data flow, or component breakdown; needs
  capacity / back-of-envelope estimation (QPS, storage, availability); wants a design reviewed for
  scalability, reliability, cost, or failure modes; is comparing clouds for a workload; or mentions
  Well-Architected pillars, edge/serverless architecture, system design, or distributed-systems
  patterns (caching, sharding, replication, messaging, event-driven, sagas, agentic-AI/LLM
  systems). Trigger even without the words "system design" when the user is making architecture or
  service-selection decisions. NOT for operating deployed resources, IaC, or pipeline failures.
---

# System Design (AWS · Azure · Google Cloud · Cloudflare)

Design systems the way a senior engineer would: pin the requirements, size the load, sketch the
simplest architecture that meets them, map each piece to a best-fit managed service on the user's
cloud, then pressure-test the whole thing against the Well-Architected pillars before calling it
done. The architecture is cloud-agnostic; the service mapping is not — keep those two steps
separate and the design stays portable and honest.

This skill is for **design decisions** — architecture, service selection, capacity, tradeoffs. It is
not for provisioning or operating live infrastructure. Keep that line clear: when the user wants a
design or a "which service / is this sound" answer, you're in the right place; when they want to
*change real resources*, hand off to the cloud's API/CLI tooling.

## What this skill will and won't do

**Will:** produce high-level architectures and data flows · justify every service choice against the
requirement that drives it · do capacity/latency/availability estimation · analyze tradeoffs,
bottlenecks, and failure modes · validate a design against the vendor's Well-Architected pillars ·
review and pressure-test an existing design · compare clouds for a workload · write a design doc /
lightweight ADR.

**Won't:** write production application code (that's an implementation task — design the interfaces
and stop) · call cloud APIs or provision/modify real infrastructure (a design is a document, not a
deployment) · pick a service by buzzword without saying *why it fits this problem* · design before
the requirements and constraints are pinned. If a request lacks the constraints needed to design
well, ask for them first — guessing scale or consistency needs produces a design that's confidently
wrong.

## The design loop

Work these six steps in order. Early steps constrain later ones, so don't jump to drawing boxes
before you know the load. Scale the depth to the request — a "which DB should I use" question needs
steps 1, 4, and 5; "design a URL shortener" needs all six.

### 1. Clarify requirements and constraints

Separate **functional** requirements (what the system does — the API/use cases) from
**non-functional** ones (how well — scale, latency, availability, consistency, durability, cost,
security, compliance). The non-functional ones drive almost every interesting decision, so surface
them explicitly.

Pin down, by asking only what you can't reasonably default: expected scale (users, requests/sec,
data volume, growth), read vs write ratio, latency target, availability/durability targets (how many
9s), consistency needs (strong vs eventual), data retention, security/compliance constraints, and
budget sensitivity. State the assumptions you're making so they're checkable. **The "why" matters
more than the "what"** — if you reach for NoSQL "to scale," be able to say what specifically
bottlenecks a relational DB here; an unjustified choice is a guess in a nicer outfit.

### 2. Estimate the load

Do the back-of-envelope math before choosing anything, because the numbers decide the shape. Compute
average and **peak** QPS (peak ≈ 2–3× average), storage/year, and read/write bandwidth. Sanity-check
against the latency numbers every engineer should know (memory ≈ 100 ns, same-DC round trip ≈
0.5 ms, SSD random read ≈ 150 µs, disk seek ≈ 10 ms, cross-continent round trip ≈ 150 ms). Default
to **read-heavy** unless told otherwise. → Formulas, latency table, and availability math in
`references/estimation.md`.

### 3. Sketch the high-level architecture

Start with the simplest thing that satisfies the requirements, then add complexity only where an
estimate or requirement forces it — a monolith behind a load balancer with a managed DB and a cache
is a legitimate answer for modest scale, and the right one if nothing demands more. Define the **API
contract** (the key operations and their shapes) and the **data model** before the boxes. Draw the
request path end to end: client → edge/CDN → API/gateway → compute → data store, plus async paths
(queues, streams, workers). Name each component by its *role* ("write-through cache," "fan-out
queue"), not yet by its product — role-first naming is what makes the design portable across clouds.
→ Patterns and when each applies in `references/patterns.md`.

### 4. Map components to cloud services

First determine the **target cloud**: an explicit statement beats codebase/infra clues beats org
context. If it's unknown and the answer depends on it, ask once ("AWS, Azure, Google Cloud, or
Cloudflare — or keep it neutral?"). If the design should stay neutral, keep components in role terms
and give the mapping for the load-bearing ones. If the user is *choosing* a cloud, weigh gravity
first (where their data, team skills, and enterprise agreements already are), then distinctive
strengths — each per-cloud file opens with them. **Cloudflare is a different axis:** it's edge-first
(no VMs, managed Kubernetes, or regional VPC), so it's sometimes the whole stack (Workers + D1 + R2 +
Durable Objects) and sometimes the edge/data tier *in front of* a hyperscaler origin (Workers +
Hyperdrive over a hosted Postgres, R2 to escape egress fees) — treat "which hyperscaler" and "edge on
Cloudflare?" as separable questions.

Then read **only the relevant cheat-sheet** — `references/aws.md`, `references/azure.md`,
`references/gcp.md`, or `references/cloudflare.md`: one for the target cloud, two for a head-to-head,
more only when the user explicitly wants a broader comparison (the quick table below often covers a
shallow one on its own). Map each
component to a best-fit service and justify it from the requirement. Prefer **managed and
serverless** — every vendor's Well-Architected default — unless control, cost at scale, or a
specific capability argues for running your own. For each non-obvious choice, name the realistic
alternative and why you didn't pick it (e.g. "DynamoDB over Aurora: single-key lookups at high
write volume, no joins; ad-hoc relational queries would flip this").

Each per-cloud reference file also carries a **live docs via MCP** note: if that cloud's
documentation/knowledge MCP is connected, use it to confirm fast-moving facts — recent renames,
current quotas, a newly shipped service — before finalizing a choice, the same MCP-first pattern
`prompt-engineering` uses against NotebookLM. Fall back to the cheat-sheet silently when the MCP
isn't connected or errors; never block a design on it.

The default picks at a glance — the per-cloud files carry the "reach for instead when…" reasoning:

| Need | AWS | Azure | Google Cloud | Cloudflare |
|---|---|---|---|---|
| Serverless functions | Lambda | Functions (Flex Consumption) | Cloud Run functions | Workers |
| Containers (default) | ECS on Fargate | Container Apps | Cloud Run | Containers |
| Kubernetes | EKS | AKS | GKE (Autopilot) | — |
| VMs / raw control | EC2 + ASG | Virtual Machines + VMSS | Compute Engine + MIG | — |
| Relational DB | Aurora | Azure SQL Database | Cloud SQL / AlloyDB | D1 · Hyperdrive (front external) |
| Key-value / document | DynamoDB | Cosmos DB | Firestore / Bigtable | Workers KV · Durable Objects |
| Cache | ElastiCache (Valkey) | Azure Managed Redis | Memorystore | Cache API · KV |
| Object storage | S3 | Blob Storage | Cloud Storage | R2 (zero egress) |
| Queue (decouple) | SQS | Service Bus | Pub/Sub / Cloud Tasks | Queues |
| Pub/sub / event bus | SNS / EventBridge | Event Grid | Pub/Sub / Eventarc | — (fan-out via Workers) |
| Stream (ordered, replay) | Kinesis / MSK | Event Hubs | Pub/Sub / Managed Kafka | Pipelines (→ R2) |
| Stream processing | Managed Service for Apache Flink | Stream Analytics | Dataflow | Pipelines (SQL at ingest) |
| Workflow orchestration | Step Functions | Durable Functions / Logic Apps | Workflows | Workflows |
| API front door | API Gateway | API Management | API Gateway / Apigee | Workers · API Shield |
| CDN / edge | CloudFront | Front Door (Std/Premium) | Cloud CDN | Cloudflare CDN + Workers |
| L7 load balancer | ALB | Application Gateway | Global external Application LB | Load Balancing |
| L4 load balancer | NLB | Load Balancer | Network LB | Spectrum |
| DNS | Route 53 | Azure DNS (+ Traffic Manager) | Cloud DNS | Cloudflare DNS |
| Full-text search | OpenSearch | AI Search | Vertex AI Search / partner Elastic | — |
| Warehouse / analytics | Redshift / Athena | Microsoft Fabric | BigQuery | R2 SQL |
| Observability | CloudWatch + X-Ray | Azure Monitor + App Insights | Cloud Monitoring / Logging / Trace | Workers Observability + Logpush |
| Workload identity | IAM roles | Entra ID managed identities | IAM service accounts | Service bindings |
| End-user identity | Cognito | Entra External ID | Identity Platform | Access (ZTNA) |
| Secrets / keys | Secrets Manager / KMS | Key Vault | Secret Manager / Cloud KMS | Secrets Store |
| LLM (managed models) | Bedrock | Microsoft Foundry (Azure OpenAI) | Vertex AI (Gemini) | Workers AI · AI Gateway |
| AI agents at scale | Bedrock AgentCore | Foundry Agent Service | Agent Engine + ADK | Agents SDK |

### 5. Validate against the Well-Architected pillars (the gate)

Don't ship a design without walking it through the pillars — this is where avoidable mistakes get
caught. All three hyperscalers publish a Well-Architected framework (AWS: six pillars; Azure: five;
Google Cloud: six); they share five themes, so review against those and add sustainability where the
framework has it:

- **Operational Excellence** — how is it observed, deployed, and recovered? Small reversible changes?
- **Security** — least-privilege identity, encryption in transit and at rest, defense in depth, secrets handled? (Google folds privacy & compliance in here — check residency/regulatory needs.)
- **Reliability** — what fails, and what happens when it does? Redundancy across zones, retries/backoff, no single point of failure?
- **Performance Efficiency** — does the data store/compute match the access pattern? Where's the bottleneck at peak, quantified?
- **Cost Optimization** — consumption-based where spiky, right-sized, no undifferentiated heavy lifting?
- **Sustainability** (AWS & Google pillars; Azure folds it into cost/ops) — utilization high, managed services preferred, downstream impact minimized?

For a full design, run the **design-quality self-review checklist** in
`references/well-architected.md` — it catches requirement gaps, missing fault-tolerance,
extensibility, and unstated tradeoffs, and the same file has each vendor's exact pillars and
design principles for a framework-faithful review. **Cloudflare publishes no formal Well-Architected
framework** — review a Cloudflare design against the same five shared themes above (its Reference
Architecture library is the closest equivalent), as `references/well-architected.md` notes. For a
quick service-choice answer, the pillar list above is gate enough. Either way, explicitly identify
the bottleneck, the dominant failure mode, and the one or two tradeoffs you consciously made.

### 6. Document the design

Deliver a written design using the structure below.

## Output format

```
# <System> — Architecture

## Requirements
- Functional: <key use cases / API>
- Non-functional: <scale, latency, availability, consistency, durability, cost, security>
- Assumptions: <what you assumed and would confirm>

## Capacity estimate
- Peak QPS, storage/yr, bandwidth, key sizing — with the arithmetic shown

## Architecture
- Request path (client → edge → API → compute → data), async paths
- API contract (key operations) and data model
- A described diagram (components + arrows); offer to render it if a diagram tool is available

## Service mapping (<cloud>)
- Component → service, each with a one-line "why this, not <alternative>"
- (cloud-neutral designs: the three-way mapping for load-bearing components)

## Well-Architected review
- One line per pillar: how the design addresses it (or the accepted gap)

## Tradeoffs, bottlenecks & failure modes
- The conscious tradeoffs, the bottleneck at scale, the dominant failure mode + mitigation

## Cost notes & open questions
```

If a diagram tool (e.g. an ai-drawio MCP) is connected, offer to render the architecture — a picture
carries an architecture better than prose. Otherwise describe it clearly enough to draw by hand.

## Common mistakes to avoid

- **Designing without constraints.** No scale/consistency/latency numbers → the design is a guess. Pin them or ask.
- **Buzzword-driven selection.** "Use Kafka, it scales" isn't a reason. Tie every choice to the requirement it serves.
- **Porting service names, not designs.** The clouds' "equivalents" differ in ways that change the design: Cosmos DB prices by RU and offers five consistency levels, DynamoDB doesn't; Pub/Sub is one service covering queue + fan-out + stream, SQS/SNS/Kinesis are three; a GCP load balancer is global anycast, an ALB is regional; Cloudflare Workers KV is eventually consistent and there's no managed event bus, so a design that leans on strong-read KV or SNS-style fan-out must be re-derived, not translated. Re-derive the choice from the requirement on the target cloud.
- **Single points of failure.** One zone, one node, one queue with no DLQ. Walk the failure modes in step 5.
- **Average-case sizing.** Capacity must cover peak (2–3× avg), not the average, or it falls over exactly when it matters.
- **Over-engineering.** Microservices, multi-region, and event sourcing for a system that serves 10 QPS is its own failure. The simplest design that meets the requirements is the correct one; add complexity only when an estimate forces it.
- **Mixing implementation into architecture.** Design the interfaces and data flow; don't drift into writing the handler code.
- **No tradeoff or failure analysis.** A design with no stated tradeoffs hasn't been thought through — every real choice gives something up.

## Reference files

Read these as the step needs them — don't front-load all of them:

- `references/estimation.md` — capacity formulas, the latency numbers, availability/9s math, a worked estimate. (Step 2)
- `references/patterns.md` — distributed-systems patterns (scaling, load balancing, caching, sharding, replication, messaging, CDN, microservices, serverless, CAP/consistency, locking) plus event-driven architecture, the saga pattern, event sourcing/CQRS, reliable-messaging building blocks (idempotency, dedup, DLQ, transactional outbox, circuit breaker), and serverless anti-patterns — each with its AWS/Azure/GCP incarnation. (Step 3)
- `references/aws.md` / `references/azure.md` / `references/gcp.md` / `references/cloudflare.md` — per-cloud service-selection cheat-sheets with the criteria for picking between close alternatives, including AI/ML & generative-AI services. Read the target cloud's file; two for a head-to-head, more only for an explicit multi-cloud comparison. `cloudflare.md` is edge-first and flags what the platform deliberately lacks (VMs, managed Kubernetes, event bus). (Step 4)
- `references/well-architected.md` — the three vendors' frameworks (pillars + design principles), a cross-framework mapping, and the design-quality self-review checklist. (Step 5)
- `references/networking-os.md` — networking and OS fundamentals that shape designs (OSI/TCP/UDP, DNS, TLS, L4-vs-L7 load balancing, NAT/BGP/anycast, sockets/ports/connection limits, kernel tunables) with the per-cloud product names, network-scope differences (global vs regional VPCs), and routing policies. Read when a design hinges on networking or low-level behavior.
- `references/agentic-ai.md` — designing LLM **agent** systems: the decisions specific to agents, then the three platforms (Bedrock AgentCore, Foundry Agent Service, Vertex AI Agent Engine / Gemini Enterprise Agent Platform). Read only when the design is an autonomous/tool-using agent, not a single model call.
- `references/worked-examples.md` — condensed end-to-end designs (URL shortener, KV store, news feed, distributed messaging, rate limiter, notification fan-out, metric monitoring) following this exact loop, each with its three-cloud service mapping. Read when the request resembles one of these seven classics or a close cousin.

## Sources & attribution

Generalized from the `aws-system-design` skill against the hyperscalers' Well-Architected docs;
parts of `patterns.md`/`agentic-ai.md` adapted from zxkane/aws-skills (MIT, © 2025 Mengxin Zhu).
Service facts verified against vendor docs and announcements (AWS, Azure, Google Cloud, and
Cloudflare Developer Docs), July 2026.
