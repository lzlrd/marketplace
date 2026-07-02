# Well-Architected Frameworks & Design-Quality Checklist

Tools for step 5 (the validation gate): all three vendors' frameworks — pillars and design
principles — a cross-framework map, and a design-quality self-review checklist. Review against the
**target cloud's own framework** (its review tooling, docs, and reviewers speak that dialect); the
checklist at the end applies everywhere. Pillar sets current as of mid-2026.

## The frameworks at a glance

| Theme | AWS Well-Architected (6) | Azure Well-Architected (5) | Google Cloud Well-Architected (6) |
|---|---|---|---|
| Operations | Operational Excellence | Operational Excellence | Operational excellence |
| Security | Security | Security | Security, privacy, and compliance |
| Reliability | Reliability | Reliability | Reliability |
| Performance | Performance Efficiency | Performance Efficiency | Performance optimization |
| Cost | Cost Optimization | Cost Optimization | Cost optimization |
| Sustainability | Sustainability | — (folded into cost/ops guidance) | Sustainability |

Notes that matter in review: Google's security pillar explicitly includes **privacy and
compliance** — surface data-residency and regulatory needs there. Google also layers cross-pillar
**perspectives** (AI/ML, financial services) and framework-wide core principles: design for change ·
document the architecture · simplify and use managed services · decouple · prefer stateless.
Azure ships a formal **Well-Architected Review** assessment and per-service guides; AWS has the
Well-Architected Tool and domain lenses (serverless, SaaS, ML…).

## AWS — design principles per pillar

**Operational Excellence** — organize around business outcomes; observability for actionable
insights; safely automate; frequent, small, reversible changes; refine procedures often; anticipate
failure (pre-mortems, game days); learn from all events.

**Security** — strong identity foundation (least privilege, central identity); maintain
traceability; security at all layers (defense in depth); automate best practices; protect data in
transit and at rest; keep people away from data; prepare for security events.

**Reliability** — automatically recover from failure; test recovery procedures; scale horizontally
to raise aggregate availability; stop guessing capacity (auto-scale to demand); manage change
through automation/IaC.

**Performance Efficiency** — democratize advanced tech (consume as managed services); go global in
minutes when it serves users; use serverless architectures; experiment more often; mechanical
sympathy (match technology to access pattern).

**Cost Optimization** — practice Cloud Financial Management; adopt a consumption model; measure
overall efficiency; stop spending on undifferentiated heavy lifting; analyze and attribute
expenditure.

**Sustainability** — understand your impact; set goals; maximize utilization; adopt more efficient
hardware/software as it appears; use managed services; reduce downstream impact.

## Azure — design principles per pillar

**Reliability** — design for business requirements (targets/SLOs first); design for resilience
(redundancy, self-healing, fault isolation); design for recovery (tested DR, backups); design for
operations (observe health, drill failures); keep it simple — complexity is itself a reliability
risk.

**Security** — plan a security readiness baseline; design to protect confidentiality, integrity,
and availability; assume breach — segment, apply least privilege and defense in depth, prepare
response; sustain and evolve the posture (Zero Trust as the default stance).

**Cost Optimization** — build a cost model and budgets; align usage to real demand (right-size,
scale to zero where possible); pay only for what you use; optimize continuously over time; make
cost a shared, visible responsibility.

**Operational Excellence** — embrace DevOps culture; standardize and automate (IaC, safe
deployment practices, progressive rollout); build observability in; improve continuously from
incidents and metrics.

**Performance Efficiency** — negotiate realistic performance targets; design to meet capacity
requirements (scale horizontally, partition); test and measure continuously; adapt as load and
platform evolve.

## Google Cloud — pillar focus

**Operational excellence** — efficiently deploy, operate, monitor, and manage workloads
(automation, incident learning, SRE practice — error budgets, toil reduction).

**Security, privacy, and compliance** — maximize security of data and workloads; design for
privacy; align with regulatory requirements and standards (least privilege, defense in depth,
data residency).

**Reliability** — design and operate resilient, highly available workloads; set SLOs and measure
against them; degrade gracefully.

**Cost optimization** — maximize the business value of spend; right-size; exploit
serverless/autoscaling economics; attribute costs.

**Performance optimization** — design and tune resources for optimal performance; match the
service to the access pattern; measure at peak.

**Sustainability** — build and manage workloads that are environmentally sustainable; high
utilization; efficient regions and hardware.

## Design-quality self-review checklist

Derived from Amazon's "System Design" functional competency behaviors — the traits that distinguish
a strong design from a concerning one. They're cloud-agnostic; a strong design hits these on any
vendor. Read each as "have I actually done this?"

**Requirements & scope**
- [ ] All requirements needed for a working solution are identified, and unclear ones were clarified rather than assumed silently.
- [ ] Edge cases are identified, and the impact of technical requirements on design choices is articulated.
- [ ] The problem is broken into functional components with clear boundaries — not one undifferentiated blob.

**Solution correctness & fit**
- [ ] The solution actually meets the identified requirements within the stated constraints.
- [ ] It makes efficient use of resources in the chosen tech stack (right service for the access pattern).
- [ ] Impact on other components/systems is considered — no change lands in isolation.
- [ ] It avoids reasonably avoidable complexity (the simplest design that meets the requirements).

**Resilience & operability**
- [ ] The design incorporates fault-tolerance and/or monitoring — it degrades gracefully, and you can see it doing so.
- [ ] Operational performance under adverse conditions (load spikes, dependency failure, partition) is considered.
- [ ] Failure modes are enumerated with mitigations; there is no unaddressed single point of failure.

**Extensibility & maintenance**
- [ ] The design is extensible to reasonable future changes in load or environment.
- [ ] It minimizes long-term maintenance effort and cost (managed over bespoke where it pays).

**Tradeoffs**
- [ ] Intentional tradeoff decisions are made *in support of the requirements*, not by accident.
- [ ] The case for and against the main alternatives is articulated — you can say why this approach beat the runner-up.

### How the checklist maps to the pillar themes

The competency behaviors and the pillars are two views of the same thing — the mapping makes the
gate faster (theme names per the table at the top; they resolve to each vendor's pillar):

| Checklist group | Primary theme(s) |
|---|---|
| Requirements & scope | Operations; correctness foundation for all |
| Solution correctness & fit | Performance; Cost |
| Resilience & operability | Reliability; Operations |
| Extensibility & maintenance | Operations; Cost; Sustainability |
| Tradeoffs | Cross-cutting (every pillar is a tradeoff axis) |

Security sits across all of them — apply its design principles regardless of which checklist group
you're in.

Sources: AWS Well-Architected Framework (`docs.aws.amazon.com/wellarchitected/`) · Microsoft Azure
Well-Architected Framework (`learn.microsoft.com/azure/well-architected/`) · Google Cloud
Well-Architected Framework (`docs.cloud.google.com/architecture/framework`) · Amazon System Design
functional competency guide.
