# system-design

System design for [Claude Code](https://github.com/anthropics/claude-code) across
**AWS, Azure, and Google Cloud**, or cloud-neutrally. Describe a system in plain language
and the skill pins requirements, sizes the load, sketches the simplest architecture that
fits, maps each piece to a best-fit managed service on your cloud, and pressure-tests it
against the vendor's Well-Architected framework before calling it done. There is no command
to type.

```
You: "design a URL shortener for 100M redirects/day on GCP"   (no command)
        │  skill `system-design` auto-engages and works the loop:
        ▼
   1. Requirements   ── functional + non-functional (scale, latency, consistency…)
   2. Estimate       ── peak QPS, storage/yr, bandwidth, the 9s
   3. Architecture   ── request path + data model, in role terms (portable)
   4. Service map    ── role → best-fit service on the target cloud, with a "why"
   5. WA review      ── the vendor's pillars: reliability, security, cost, ops, perf…
   6. Document       ── requirements · capacity · architecture · mapping · tradeoffs
```

## Auto-Engagement

The entry point is an auto-invoked skill named `system-design`. Claude loads it when a
request looks like architecture or service-selection work: "design…", "architect…",
"scale…", "which database/queue/service should I use…", "compare AWS vs Azure for…",
"size this for N users…", "review this design…". It needs no command, and is slash-available
as `/system-design:system-design` if you want to force it.

It stays out of operating or debugging deployed resources, infrastructure-as-code authoring,
and pipeline/build failures. Those are not design work. If the request lacks the constraints
needed to design well (scale, consistency, latency), it asks before guessing.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install system-design@lzlrd
```

Restart the session. Check: the `system-design` skill shows in the skills list and
`/system-design:system-design` is registered.

## The Design Loop

Six steps, worked in order. Early steps constrain later ones. The depth scales to the
request: a "which DB should I use" question needs steps 1, 4, and 5; a full "design X" needs
all six.

1. **Clarify requirements.** Separate functional (what it does) from non-functional (scale,
   latency, availability, consistency, durability, cost, security). The non-functional ones
   drive the interesting decisions.
2. **Estimate the load.** Back-of-envelope math *before* choosing anything: peak QPS
   (≈2-3× average), storage/year, bandwidth, availability. The numbers decide the shape.
3. **Sketch the architecture.** The simplest thing that meets the requirements, named in
   **role terms** ("write-through cache", "fan-out queue"), not products. Role-first naming
   keeps the design portable across clouds.
4. **Map to cloud services.** Only now name products, best-fit per requirement, each with a
   one-line "why this, not the alternative". One per-cloud cheat-sheet loads on demand.
5. **Well-Architected review.** Walk the vendor's pillars; name the bottleneck, the dominant
   failure mode, and the one or two tradeoffs consciously made.
6. **Document.** A written design in a consistent structure.

## Three Clouds, One Design

The architecture is cloud-agnostic; the service mapping is not. The skill keeps those steps
separate so a design stays honest and portable. It ships the three vendors' Well-Architected
frameworks (AWS: 6 pillars, Azure: 5, Google Cloud: 6), per-cloud service-selection
cheat-sheets, and a rule against the commonest cross-cloud trap: porting service *names*
instead of re-deriving the *choice* (Cosmos DB's RU model and five consistency levels,
Pub/Sub covering queue + fan-out + stream in one service, a global anycast load balancer vs a
regional one: differences that change the design).

## Structure

```
system-design/
├── .claude-plugin/
│   └── plugin.json          # manifest
└── skills/system-design/
    ├── SKILL.md             # the design loop + three-cloud quick table (always loaded)
    └── references/          # loaded on demand, only what the step needs
        ├── estimation.md        # capacity formulas, latency numbers, the 9s
        ├── patterns.md          # distributed-systems patterns, each with its AWS/Azure/GCP form
        ├── aws.md / azure.md / gcp.md   # per-cloud service cheat-sheets (read the target cloud's)
        ├── well-architected.md  # the three frameworks + a design-quality checklist
        ├── networking-os.md     # DNS, TLS, L4-vs-L7, connection limits, per-cloud names
        ├── agentic-ai.md        # designing LLM agent systems on the three platforms
        └── worked-examples.md   # seven end-to-end designs, each mapped to all three clouds
```

Progressive disclosure: a typical task loads `SKILL.md` and one to three references, never
the full set of nine.
