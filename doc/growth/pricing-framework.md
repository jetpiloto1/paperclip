# Paperclip — Low-Cost Pricing Framework

## The Core Promise

**An autonomous AI workforce at 1/10th the cost of alternatives.**

Paperclip is MIT-licensed open-source software. It is free. There are no per-seat fees, no platform markup on tokens, no hidden costs. You pay only for the LLM API tokens your agents consume — through your own API keys, at your contracted rates.

---

## Pricing Model: What You Pay For

| Component | Cost | Who Pays |
|-----------|------|----------|
| Paperclip software | **$0** — MIT open source | — |
| LLM API tokens | At-cost via your own provider accounts | You |
| Hosting infrastructure | Self-hosted (your own hardware/cloud) | You |
| ClipHub templates | Free (V1), marketplace fees TBD (V2) | — |
| Cloud-hosted Paperclip | Not yet available (future offering) | — |

---

## The Value Proposition

### vs. Human Employees

| Role | Human Annual Cost | Paperclip Agent Cost* | Savings |
|------|------------------|----------------------|---------|
| Junior Engineer | $80,000–$120,000 | $1,200–$3,600 | ~97% |
| Marketing Specialist | $55,000–$75,000 | $600–$1,800 | ~97% |
| Content Writer | $50,000–$65,000 | $300–$1,200 | ~98% |
| Data Analyst | $70,000–$95,000 | $1,200–$3,600 | ~96% |

*_Assumes Claude Sonnet 4 / GPT-4o class models, ~500K–1M tokens/day per agent, at current API pricing. Actual costs vary by model choice, usage patterns, and provider._

### vs. AI SaaS Platforms

Most AI team/productivity platforms charge per-seat fees ($20–$200/user/month) on top of underlying model costs. Paperclip charges $0 in platform fees — your only cost is the tokens your agents use.

| Platform | Per-Seat Fee | Token Markup | Total for 5 Agents |
|----------|-------------|--------------|-------------------|
| Paperclip (self-hosted) | $0 | 0% | ~$50–150/mo (tokens only) |
| Typical AI SaaS | $30–100/seat/mo | 20–50% | $150–500/mo + tokens |

---

## Cost Control Built In

Paperclip includes first-class budget enforcement:

- **Per-agent budgets** — set monthly token/cost limits per agent
- **Per-company budgets** — aggregate caps across all agents
- **Soft alerts at 80%** — agents are warned before hitting limits
- **Hard stop at 100%** — agents auto-pause until budget is reset
- **Cost breakdowns** — by agent, project, model, provider, time period

This means you can run a full AI company and know exactly what it costs — and cap it at whatever you're comfortable with.

---

## Low-Cost Agent Design Patterns

Users can reduce costs further by:

1. **Model tiering** — use cheap/fast models (Sonnet, Haiku, GPT-4o-mini) for routine work, reserve expensive models (Opus, o1) for complex reasoning
2. **Smart model routing** — Paperclip's planned routing feature dispatches each subtask to the cheapest capable model
3. **Prompt optimization** — shorter, more focused agent instructions reduce token burn
4. **Batch processing** — consolidate work into fewer, richer heartbeat cycles
5. **Local models** — run open-weight models (Llama, Mistral, Qwen) locally via Ollama/vLLM for $0/token inference

---

## Future Monetization (Post-V1)

Paperclip will remain open-source and self-hostable forever. Future revenue will come from optional paid offerings:

| Offering | Model | Status |
|----------|-------|--------|
| **Cloud-hosted Paperclip** | Monthly subscription (usage-based or flat) | Planned |
| **ClipHub premium templates** | Publisher revenue share | V2 consideration |
| **Enterprise features** | SSO, audit logging, dedicated support | Future |
| **Managed provider routing** | Zero-markup token pass-through + service fee | Future |

These will never gate core functionality. The self-hosted, free version is the product — cloud/enterprise are convenience layers.

---

## Positioning Statement

> Paperclip gives you an autonomous AI workforce for the cost of the tokens they use. No per-seat fees, no platform tax, no vendor lock-in. MIT open source, self-hosted, and designed to be the most cost-effective way to deploy AI agents at any scale.

### Key Messaging Pillars

1. **Zero platform markup** — you bring your own API keys, you pay your contracted rates
2. **Open source, not open core** — no bait-and-switch, no enterprise feature gatekeeping
3. **Own your infrastructure** — self-hosted means no data egress fees, no per-seat creep
4. **Cost visibility** — know exactly what every agent costs, down to the token
5. **Scale on your terms** — one agent or a hundred, the per-agent cost is the same

---

## Competitive Landscape

| | Paperclip | Human Employees | AI SaaS Platforms | Build Your Own |
|---|---|---|---|---|
| Platform cost | $0 | Salary + benefits + overhead | $20–200/seat/mo | Engineering time |
| Token cost | At-cost (your keys) | N/A | Marked up 20–50% | At-cost |
| Setup time | Hours | Weeks–months | Minutes–hours | Weeks–months |
| Flexibility | Full (open source) | High | Constrained | Full |
| Ops burden | Self-host | HR + management | Low | High |
| Data control | Full (self-hosted) | N/A | Vendor-dependent | Full |
| Agent ecosystem | ClipHub (growing) | N/A | Walled garden | None |

---

## Go-to-Market Implications

- **Primary audience**: Developers and technical founders who already manage API keys and infrastructure
- **Messaging angle**: "Your AI team, at token cost. No markup. No lock-in."
- **Conversion path**: Install (5 min) → Create company → See CEO work → Scale up → Invite team
- **Barrier to adoption**: Self-hosting requirement (mitigated by Docker Compose, docs, community)
- **Differentiator**: Radical cost transparency in a market full of opaque SaaS pricing
