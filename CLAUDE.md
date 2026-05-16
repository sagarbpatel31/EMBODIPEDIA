# CLAUDE.md — Operating Manual for Claude Code

**Project:** Embodipedia
**Builder:** Sagar Patel (solo)
**Deadline:** 48 hours
**Reference doc:** `EMBODIPEDIA_PLAN.md` in this repo (read it; it contains the strategy, schema, demo moments, and build plan)

---

## What this file is

You (Claude Code) are helping Sagar ship a hackathon project in 48 hours. The full strategy lives in `EMBODIPEDIA_PLAN.md`. This file tells you **how to operate** during the build:

- Which phase we're in
- What's in scope for this phase
- What's explicitly out of scope
- Acceptance criteria before moving on
- Rules of engagement

Read both files. Refer back to the plan for context (schema, demo moments, agent design). Refer to this file for what to do *right now*.

---

## Rules of Engagement

1. **Phase gates are hard.** Do not begin Phase N+1 until Sagar confirms Phase N is complete. If unsure, ask.
2. **HydraDB SDK signatures may differ from what's in the plan.** Sagar has built on HydraDB before (HydraSwarm). Treat any HydraDB code in the plan as pseudocode. When in doubt, check `https://docs.hydradb.com/api-reference/sdks` or ask Sagar.
3. **Pick standard implementations.** Don't over-engineer. This is a 48-hour build. Use Next.js App Router conventions, Tailwind defaults where appropriate, simple FastAPI patterns. No clever abstractions.
4. **Comment HydraDB calls.** Every HydraDB SDK call should have a brief comment explaining *what perspective sub-tenant* it's writing to or reading from and *why*. This is the architectural moat — make it visible in the code.
5. **One feature at a time, end-to-end.** Resist the urge to build the schema completely, then all the agents, then all the UI. Instead: ship one source type → one entity → one rendered article. Then add.
6. **Ask before adding dependencies.** Stick to what's listed in Tech Stack (plan section 11). Adding new libraries costs time.
7. **Wikipedia visual fidelity matters.** When you write CSS, copy real Wikipedia's typography. Do not use modern SaaS aesthetics (rounded-xl, shadows, gradients) for article rendering. Modern UI is only acceptable in the Cmd+K palette and Recent Changes sidebar.
8. **`[citation needed]` is a feature, not a bug.** When the synthesis agent can't ground a claim with confidence ≥ 0.7 + ≥ 1 primary source, the prose must render `[citation needed]` inline. This is the "I don't know" hero feature.
9. **The Talk page is the demo moment.** When in doubt about what to polish, polish the Figure 02 Talk page. It's where moment 3 of the demo happens.
10. **Pre-cooking is allowed and encouraged.** Demo entities (Figure, Optimus, π0) can have hand-curated claim memories alongside agent-extracted ones. The system doesn't have to discover everything autonomously — it has to demonstrate the capability.

---

## Phase 0: Repo bootstrap (target: 30 min)

**Goal:** Working scaffold with HydraDB client verified, deployable Next.js app, FastAPI backend, env wired.

### Tasks

1. Create the repo layout from `EMBODIPEDIA_PLAN.md` section 11. Top-level dirs: `apps/web/`, `apps/agents/`, `data/`, `scripts/`, `docs/`, `tests/`.
2. Initialize Next.js 15 App Router app in `apps/web/` with TypeScript and Tailwind.
3. Initialize Python FastAPI backend in `apps/agents/` with `requirements.txt` (hydradb, fastapi, uvicorn, openai or anthropic, python-dotenv, pydantic, httpx).
4. Create `.env.example` with required vars: `HYDRADB_API_KEY`, `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`), `TWITTER_BEARER_TOKEN` (optional for v1).
5. Create `apps/agents/hydradb_client.py` — a thin wrapper around the HydraDB SDK. **Do not invent method signatures.** Wait for Sagar to confirm the real method names from his HydraSwarm work. Stub with TODOs if needed.
6. Deploy the Next.js scaffold to Vercel with placeholder homepage. Confirm the URL works.

### Acceptance criteria

- [ ] `apps/web/` builds and deploys to Vercel
- [ ] `apps/agents/` has a working `python -m apps.agents.main` that prints "FastAPI up"
- [ ] `hydradb_client.py` exists with method stubs (`add_claim`, `recall`, `add_hive_lesson`, etc.) ready to be filled in
- [ ] `.env.example` committed; `.env` in `.gitignore`
- [ ] `EMBODIPEDIA_PLAN.md` and `CLAUDE.md` are at repo root

**Stop and wait for Sagar before moving on.**

---

## Phase 1: First end-to-end slice (target: 4 hours)

**Goal:** One tweet → one extracted claim → one HydraDB memory → one rendered prose sentence with a citation footnote. End-to-end, on one entity (Figure 02).

This is the smallest possible vertical slice. Do not expand scope. Do not start the second source type. Do not build the Talk page yet.

### Tasks

1. **Schema lock.** Implement the memory metadata schema from `EMBODIPEDIA_PLAN.md` section 7 as a Pydantic model in `apps/agents/schema.py`. Every field. Use strict typing.
2. **Tweet ingest function.** Take a tweet URL + tweet text + author handle as input. Hardcode 5 real Brett Adcock tweets in `data/seed_tweets.yaml` to start — don't bother with the Twitter API yet.
3. **Tweet extraction agent.** Given a tweet, extract claims using an LLM call. Each claim becomes one knowledge memory with full metadata. Use the prompt from `agent_prompts.md`. Write to `canonical` sub-tenant only for this phase (skip bull/bear until Phase 3).
4. **Synthesis function for one entity.** Given entity name "Figure 02", recall all claims with that subject from `canonical`. Generate one paragraph of prose with footnoted citations.
5. **Article page route.** Implement `/wiki/[slug]` in Next.js. Server-side render the synthesized prose. Show one paragraph with citation footnotes.

### Acceptance criteria

- [ ] 5 Brett Adcock tweets are ingested as ~10-15 claim memories in HydraDB
- [ ] Visiting `/wiki/Figure_02` shows synthesized prose with at least 3 footnote citations
- [ ] Each footnote links to the source tweet URL
- [ ] At least one claim renders with `[citation needed]` tag (engineer one if natural confidence doesn't produce it — manually downgrade a claim's confidence to test the rendering)

**Stop and wait for Sagar before moving on.** Sagar should be able to open the URL, see the prose, click a citation, see the tweet. If any of that doesn't work, fix before Phase 2.

---

## Phase 2: Scale to four source types (target: 6 hours)

**Goal:** All four extractors working. ~120 memories ingested across multiple entities.

### Tasks

1. **Add three more extractor agents** in `apps/agents/extractors/`:
   - `paper_agent.py` — takes arxiv URL or PDF path, extracts methods, benchmarks, claims
   - `transcript_agent.py` — takes transcript text + metadata, extracts speaker-attributed claims
   - `news_agent.py` — takes article URL, extracts reported facts vs quoted claims
2. **Ingest the seed sources** from `data/seed_sources.yaml`. Batch where possible. Use the verify-processing endpoint to confirm completion.
3. **Generalize article rendering.** The `/wiki/[slug]` route should work for any entity in the corpus, not just Figure. Render infoboxes (structured metadata table top right) and References sections (numbered list at bottom).
4. **Add 5 more entity pages to the demo surface:** Tesla Optimus, 1X Neo, Unitree G1, π0 (Physical Intelligence), Apptronik Apollo. These plus Figure 02 are your 6 hero articles.

### Acceptance criteria

- [ ] ~120 memories in `canonical` sub-tenant across 4 source types
- [ ] 6 entity pages render with prose, citations, infobox, References section
- [ ] At least 3 `[citation needed]` tags appear naturally across the 6 pages
- [ ] Each page has ≥ 10 footnoted citations

**Stop and wait for Sagar before moving on.**

---

## Phase 3: The dual-narrative architecture (target: 4 hours)

**Goal:** The bull and bear sub-tenants are live. Talk pages render agent debates.

This is the architectural distinctive of the project. Do not skip or shortcut.

### Tasks

1. **Modify extraction agents** to classify each claim's perspective (bull / bear / neutral) and write to the appropriate sub-tenant(s). Use the classification rules in the agent prompts. A single tweet can produce claims in multiple sub-tenants.
2. **Re-run ingestion** for the full corpus. Each memory now exists in `canonical` AND/OR `bull` AND/OR `bear`.
3. **Hive memory wiring.** After each extraction batch, the agent should write 1-3 lessons to the `agents` sub-tenant about source patterns (e.g., "Brett Adcock's deployment timelines tend to slip"). These get read by future extractor runs.
4. **Talk page route.** Implement `/wiki/Talk:[slug]`. The page has three sections:
   - **Open Questions** — claims where neither bull nor bear has strong evidence
   - **Active Debates** — claims where bull and bear disagree; show each side's argument and citations
   - **Supersession Log** — claims that have been overridden by newer evidence
5. **Synthesis agent updates.** When rendering an article, the synthesis agent should now query all three sub-tenants and weave the canonical view into the article, with debate hints linking to the Talk page.

### Acceptance criteria

- [ ] Figure 02's Talk page shows at least 2 active debates with bull vs bear arguments, each with citations
- [ ] At least one Open Question is surfaced per major entity
- [ ] The `agents` sub-tenant has ≥ 10 hive memories
- [ ] Article body links to Talk page for any contested claim

**This is the single most important phase. Polish here. Stop and wait for Sagar.**

---

## Phase 4: Wikipedia editorial primitives (target: 6 hours)

**Goal:** History tab, time-travel slider, References anchors, What Links Here, Disambiguation. The full Wikipedia experience.

### Tasks

1. **Edit history.** Maintain a per-article audit log of every claim added, modified, or superseded. Store in Postgres or a simple SQLite file — doesn't need to be in HydraDB. Render at `/wiki/[slug]?action=history`.
2. **Time-travel slider.** Component at the top of every article page. Drag to a past date → article re-renders using `metadata_filter` on `published_at` to exclude memories not yet ingested at that time. Use 4 pre-cached snapshot dates (Jan 2024, Jan 2025, Jan 2026, Now) rather than continuous slider for performance.
3. **References anchor links.** Footnote markers in prose (e.g., `[58]`) link to anchored entries in the References section at page bottom.
4. **What Links Here.** Implement `/wiki/Special:WhatLinksHere/[slug]`. Use HydraDB's reverse entity graph (`entity_paths` with target filter) to list articles that reference this entity.
5. **Disambiguation pages.** For entity names with multiple meanings (Pi, Atlas, etc.), implement a disambiguation page that lets the user choose.
6. **Recent Changes feed.** Implement `/wiki/Special:RecentChanges`. Real-time-ish feed of recent ingestions, sorted by `ingested_at` descending.

### Acceptance criteria

- [ ] Drag time-travel slider on Figure 02 page — article visibly changes (different claim count, different prose)
- [ ] History tab shows ≥ 20 edits for Figure 02
- [ ] `Special:WhatLinksHere/Figure_02` lists ≥ 5 other articles
- [ ] `Special:RecentChanges` shows live feed
- [ ] At least one disambiguation page (e.g., `/wiki/Pi`)

**Stop and wait for Sagar.**

---

## Phase 5: The entity reasoning + self-healing (target: 3 hours)

**Goal:** Demo moments 5 and 6 work.

### Tasks

1. **Cmd+K command palette.** Global keyboard shortcut. Free-form query input. On submit, hit a `/api/ask` endpoint that calls HydraDB `full_recall` and an LLM synthesizes a cited answer.
2. **Entity path visualization.** When the query is relational ("how is X connected to Y"), extract entity_paths from the recall response and render as a force-directed graph using `react-force-graph-2d` or `cytoscape.js`.
3. **Function routing for self-healing.** Register a refresh function as a knowledge object in HydraDB for the Figure 02 entity. When a staleness banner is shown, clicking "refresh now" hits the registered function endpoint, triggers re-ingestion, and updates the article.

### Acceptance criteria

- [ ] Cmd+K "How is Karol Hausman connected to Skild?" returns a multi-hop chain rendered as a graph
- [ ] Figure 02 page shows a "this article is N days old" banner if last_ingested_at > 14 days
- [ ] Clicking the refresh banner triggers ingestion and updates the page

**Stop and wait for Sagar.**

---

## Phase 6: Polish + demo prep (target: 4 hours)

### Tasks

1. **Wikipedia visual fidelity audit.** Walk through every demo page. Check fonts, link colors, infobox styling. Compare to en.wikipedia.org side-by-side. Fix anything jarring.
2. **Demo data pre-cooking.** For the 6 demo entities, manually review and curate the extracted claims. Delete weak/garbled claims. Hand-write 2-3 hero claims per entity if needed.
3. **Quality badges.** Add stub / good article / featured banners to each article based on evidence density (count of primary sources).
4. **Sagar's authority citations.** On the Unitree G1 article, add the XG1 hackathon project as a primary source citation. On NVIDIA GR00T article, same. See plan section 16.
5. **Homepage portal polish.** Featured article of the day, categories grid, stats banner, recent changes preview.
6. **End-to-end demo walkthrough.** Run through the 90-second demo from plan section 13. Time it. Practice 5 times.
7. **Record demo video** (Loom or screen recording).

### Acceptance criteria

- [ ] All 6 demo moments work end-to-end
- [ ] Demo runs in ≤ 90 seconds without rushing
- [ ] No console errors during demo flow
- [ ] Demo video recorded

---

## Phase 7: Ship (target: 1 hour buffer)

### Tasks

1. Polish README.md (use the template in plan section 17)
2. Deploy production build to Vercel
3. Submit to the hackathon platform
4. Post the tweet thread (plan section 17)

---

## What's explicitly out of scope

To save you decision time, here's what we are NOT building:

- **Authentication / user accounts** — the wiki is anonymous-readable. Watchlist is a stretch goal only.
- **Real-time collaboration / commenting** — wiki is read-only for humans, write-only for agents.
- **Mobile-optimized layouts** — desktop only. Judges will view on laptops.
- **Internationalization** — English only.
- **Dark mode** — match Wikipedia (light only). No toggle.
- **Production rate limiting / auth** — single-user demo deployment.
- **Tests** — write tests for the HydraDB client wrapper only. Skip UI tests.
- **Search beyond Cmd+K** — no dedicated search page. Cmd+K is the search.
- **More than the 6 hero entity pages** — auxiliary articles can exist as stubs.

---

## How to ask for help

When you (Claude Code) hit ambiguity, ask Sagar in this format:

> **Blocker:** [one sentence on what's blocked]
> **Options:** [2-3 concrete options]
> **Recommended:** [your pick and why]
> **Stakes:** [what we lose by waiting / picking wrong]

This format lets Sagar decide in under 30 seconds. Do not ask open-ended questions like "how should I handle X?" — propose options.

---

## How to summarize for Sagar at phase boundaries

When you complete a phase, post a status summary in this format:

> **Phase N complete.**
> **Built:** [what works now]
> **Skipped:** [what was descoped from the phase plan]
> **Known issues:** [anything broken or fragile]
> **Ready for Phase N+1?** Awaiting confirmation.

Sagar reviews, confirms, and you proceed.

---

## Reminder: this is a 48-hour build

When you face a tradeoff between "more correct" and "shippable on time," pick shippable. Comment the tradeoff so Sagar knows what to revisit if there's time at the end. Do not chase perfection.

The goal is to win this hackathon. The judges will see the demo, the README, and (if they dig) the code. Optimize for those three surfaces in that order.

---

*Operating manual generated by Claude on May 16, 2026.*
*If anything in this file conflicts with `EMBODIPEDIA_PLAN.md`, this file wins (it's the operational override).*
