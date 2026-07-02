# bmad-easy — Strategy & Market Context

> Human-facing content relocated from `prd.md` §9 (Why Now) and §10 (Monetization). The PRD is scoped to current-state implementation requirements for implementation agents; this document holds market timing, competitive positioning, pricing, and cost-floor analysis for decision-makers. Decision rationale is cross-referenced to `.decision-log.md`.

## Why Now

BMAD's practitioner community has grown rapidly since the npm launch in June 2025: 49,000 GitHub stars, 5,680 forks, 370 releases in 12 months. The community is active, expanding, and producing practitioner guides that are driving non-dev adoption of BMAD-adjacent tooling.

Claude Code Web, launched by Anthropic in October 2025, simultaneously validates the market — Anthropic is reducing the non-dev access barrier — and defines the competitive window. Non-technical PMs are already self-adopting Claude Code Web using practitioner guides. As Claude Code Web matures, its general-purpose browser interface increasingly covers the "browser-native BMAD access" use case. bmad-easy's window is the time before BMAD-using teams default to Claude Code Web for non-dev participation rather than adopting a purpose-built platform. That window, from Claude Code Web's launch, is approximately 12–18 months. As of June 2026, approximately 8 months have elapsed; the remaining window is approximately 4–10 months.

Developer tooling SaaS pricing increased 57% between 2024–2026. Willingness to pay for AI tooling is at a historic high, and the $20–$30/seat/month reference price is well-established by comparable products.

The moat is first-mover advantage within the BMAD practitioner community. Teams that adopt bmad-easy first accumulate Project Maps, establish Artifact conventions in their Repository, and build team habits around the platform; switching cost grows with use. The BMAD community is niche and defined enough that a purpose-built platform with a head start compounds its lead faster than a general-purpose platform can develop equivalent BMAD-specific functionality. The strategic objective is to be the established non-dev participation platform for BMAD teams before the window closes — not to compete on feature breadth with Claude Code Web.

## Monetization

Per-seat SaaS subscription. Target price point: **$25–$30/seat/month**, aligned with ChatGPT Teams ($25/seat/month), AWS Kiro ($20/seat/month), and the established norm for AI productivity tools in this category. Pricing below $20/seat signals commodity.

MVP access model: All MVP users are automatically enrolled in a full-access plan with no expiry on sign-up. No trial period, no paywall, and no billing enforcement in MVP. Subscription billing and seat management are introduced post-MVP.

No freemium tier. No self-hosting.

Self-serve sales motion for purchases below $5,000 ACV (~16 seats at $25/seat/month). Sales-assist becomes appropriate above $5,000 ACV.

**Post-MVP consideration:** Hybrid base-seat + LLM usage passthrough model. Per-seat pricing is under structural pressure from usage-based models (Gartner: 70% of businesses will prefer usage-based by 2026). The V2 pricing model should plan for a hybrid structure; MVP should not be over-engineered around it.

**Cost floor (validate before launch pricing is locked):** Each Conversation runs `claude-sonnet-4-6` inside a Daytona sandbox with extended thinking disabled (BMAD's step-based skill files provide reasoning scaffolding). Measured session costs at current Sonnet 4.6 pricing ($3.00/M input, $15.00/M output, with prompt caching): brainstorming $0.36–$0.63; full PRD session $0.77–$1.26; research and UX sessions $0.83–$1.47; architecture sessions $1.50–$2.55. Weighted average across typical planning workflows is approximately $0.77 per session. Daytona sandbox compute cost per session has not been estimated; this is deferred to the architecture phase, as it depends on Sandbox lifecycle and configuration decisions that are architecture concerns (see `prd.md` §12 Q-2). Infrastructure costs add on top. At the SM-5 retention target (≥ 4 sessions per team per month), estimated LLM cost per active seat per month is $3–$6 for typical planning use, higher for architecture-heavy teams. The $25–$30 price point must be validated against the full cost floor (LLM + Daytona compute + infrastructure) after the architecture phase provides Daytona compute estimates and after MVP launch, and before end of 2027. NFR-O1 (spend monitoring) is the operational instrument; budget alert thresholds should be calibrated against the validated cost model at launch. If the validated cost floor places gross margin below 60%, the pricing model must be revised before any further seat growth.
