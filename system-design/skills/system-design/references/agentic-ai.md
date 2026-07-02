# Designing AI Agent Systems (AWS · Azure · Google Cloud)

Read when the design involves an LLM-powered **agent** — something that reasons, calls tools, holds
conversation state, and acts — rather than a single model call. A one-shot "summarize this text"
prompt is just a model API call and needs nothing here; an autonomous, tool-using, multi-turn agent
in production is a distributed-systems design problem, and that's what this covers.

Apply the same six-step loop — agentic systems still need requirements, capacity, architecture,
service selection, a Well-Architected pass, and tradeoff analysis. This reference adds the
agent-specific components and decisions on top of that loop.

## When it's an "agent" (and when it isn't)

- **Single model call** (classify, summarize, extract, translate) → the managed model API (Bedrock · Foundry Models · Vertex AI). Stateless, simple, done. Don't over-build.
- **RAG** (answer grounded in your data) → model + a **retrieval store** (S3 Vectors/OpenSearch · AI Search · Vertex AI Search/pgvector). Still mostly a request/response system.
- **Agent** (plans, chooses and calls tools, remembers across turns, may run for a while or call other agents) → the platforms below. This is where you get cold starts, state, identity, tool governance, and observability as real concerns.

## The agent concerns — and each cloud's answer

Every platform decomposes the same way; only the names differ. Map each concern, then read the
target platform's docs for current APIs (all three are fast-moving — verify before committing).

| Concern | AWS Bedrock AgentCore | Azure: Foundry Agent Service | GCP: Agent Engine (Vertex AI / Gemini Enterprise Agent Platform) |
|---|---|---|---|
| Run/scale the agent | **Runtime** — serverless, session-isolated execution | **Hosted agents** — managed deploy/autoscale, CI/CD promotion | **Agent Engine runtime** — managed sessions, scaling |
| Expose tools | **Gateway** — REST/Lambda/MCP → governed agent tools | **1,400+ MCP-enabled tools** + connectors, private tool networking | **MCP tool governance** via API Registry; managed MCP servers for GCP services |
| Memory / state | **Memory** — session + long-term, episodic learning | **Managed memory** — persistent context across sessions | **Sessions + Memory Bank** — cross-session preferences/recall |
| Identity & credentials | **Identity** — OAuth in/out, credential providers | Entra ID + managed identities end-to-end | IAM service accounts / Workload Identity |
| Ground in your data | RAG via Bedrock Knowledge Bases / S3 Vectors | **Foundry IQ** (SharePoint, Fabric, Bing) / AI Search | Vertex AI Search / pgvector |
| Safe code execution | **Code Interpreter** (sandboxed) | sandboxed tool containers | ADK code-exec tools (sandboxed) |
| Web browsing | **Browser** (managed headless) | browser tools via connectors | browser tools via ADK/marketplace |
| Observe agent runs | **Observability** — OTel traces, CloudWatch | **Foundry Control Plane** — tracing, Azure Monitor, evaluators | Cloud Trace/Logging integrations |
| Quality & guardrails | **Evaluations** (13 built-in evaluators) + **Policy** (natural-language action bounds, preview) | built-in evaluators (groundedness, safety…), AI Red Teaming, content filters | evaluation services + Model Armor / safety filters |
| Catalog & governance | **Agent Registry** (preview) | Foundry Control Plane / agent catalog | tool/agent governance in the Agent Builder console |
| Authoring framework | any (Strands, LangGraph…) — protocol-level HTTP/MCP/A2A | **Microsoft Agent Framework** (Semantic Kernel + AutoGen successor); OpenAI Responses-API compatible | **ADK** (code-first), Agent Studio (low-code) |

**Cross-platform notes.** **MCP** is the tool-integration standard on all three — design tools as
MCP servers and they stay portable. **A2A** (agent-to-agent, Linux Foundation) is the emerging
cross-vendor agent protocol — Google pushes it hardest; AgentCore speaks it too. Authoring
frameworks (LangGraph, Agent Framework, ADK, Strands) run anywhere containers run — the platform
lock-in lives in memory, identity, and governance services, not the agent code. Naming is in
flux (2026): Azure's stack is now **Microsoft Foundry**; Google's is being rebranded **Gemini
Enterprise Agent Platform** — verify current names/regions/APIs against vendor docs before
committing a design.

## Design decisions specific to agents

- **Runtime lifecycle — per-request vs per-session.** Per-request is stateless and simplest; per-session keeps a warm context across a conversation (lower latency, holds state) at the cost of session affinity. Choose by whether turns depend on each other.
- **Tool integration protocol.** **MCP** for standardized tool servers, plain HTTP for simple APIs, **A2A** for agent-to-agent. Front existing APIs with the platform's gateway (AgentCore Gateway · Foundry tool connections · API Registry) instead of teaching every agent bespoke auth.
- **Memory boundary.** Decide what's short-term (within a session) vs long-term (persisted across sessions), and the retention/privacy policy for it — conversation history is user data (security pillar; GDPR/residency if the security pillar has privacy folded in, as Google's does).
- **Identity & least privilege.** The agent acts on behalf of a user or itself; scope its credentials tightly, rotate them, and never bake secrets into the agent. Outbound calls use credential providers / managed identities / service accounts — not hard-coded keys.
- **Cost & latency.** Token cost and model latency dominate — the infra is rounding error. Design levers: pick the smallest model that meets quality, cache/reuse retrieved context, stream responses, and bound tool-call loops so a runaway agent can't rack up cost (a max-steps cap, analogous to the circuit breaker in `references/patterns.md`).
- **Governance & evaluation.** At org scale, catalog agents/tools with an approval workflow, and wire evaluations + observability so quality regressions and bad sessions are visible — the operations pillar applied to agents.

## Well-Architected lens for agents

The pillars still apply, with agent-specific emphasis:

- **Security** — least-privilege agent identity; sandbox model-generated code; treat tool access as an attack surface (an agent with a powerful tool is a powerful actor); guard against prompt injection on untrusted input (anything the agent reads is input).
- **Reliability** — bound tool/reasoning loops; handle model throttling/timeouts with backoff; DLQ for failed async agent tasks.
- **Performance Efficiency** — right-size the model; per-session warmth to cut cold starts; stream tokens.
- **Cost Optimization** — token spend is the bill; cap steps, cache context, choose the cheapest adequate model.
- **Operational Excellence** — trace every run, evaluate quality continuously, catalog and govern centrally.

AgentCore material adapted from the MIT-licensed `aws-agentic-ai` skill in zxkane/aws-skills (see
SKILL.md "Sources & attribution"); Azure/GCP platform mappings verified against vendor docs and
announcements, July 2026. All three platforms ship features monthly — treat the table as the map,
not the territory.
