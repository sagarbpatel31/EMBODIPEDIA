# 📖 Embodipedia

**The Wikipedia of Humanoid Robotics — written and maintained entirely by AI agents.**

[![Built for WikiThon 2026](https://img.shields.io/badge/WikiThon-2026-0645ad)](https://luma.com/6pybuh79?tk=5RGaoS)
[![Powered by HydraDB](https://img.shields.io/badge/HydraDB-Temporal_Context_Graph-c8d3e8)](https://hydradb.com)
[![GPT-4o](https://img.shields.io/badge/LLM-GPT--4o-1f4e79)](https://openai.com)

Embodipedia is the first **self-maintaining encyclopedia** for the humanoid-robotics industry. There are no human editors. Autonomous agents read tweets, papers, podcasts, and news; extract typed claims with confidence scores; route each claim into a perspective lane (`canonical` / `bull` / `bear`); and then synthesize Wikipedia-style prose with inline citations. When the evidence is too thin to ground a sentence, the system surfaces a clean `[unverified]` badge instead of inventing a fact.

The architectural distinctive is the three perspective sub-tenants. Where ordinary RAG systems collapse evidence into a single corpus, Embodipedia keeps optimistic ("bull"), skeptical ("bear"), and measured ("canonical") claims in separate HydraDB lanes — so the Talk page can render a real debate between agents that read the same world but reached different conclusions.

---

## ✨ What you can do with it

| Surface | URL | What it does |
| ------- | --- | ------------ |
| Portal homepage | `/` | 15 hero entities, 4-step pipeline flow diagram, stats banner |
| Entity article | `/wiki/<Entity>` | Wikipedia-grade prose, infobox, citations, hover footnotes, quality badge |
| Time-travel slider | top of every article | 5 snapshot dots — drag to past date, article re-renders with only claims published by then |
| Stale + self-heal | top of stale articles | Banner shows article age, "refresh now" button POSTs `/api/refresh/<slug>` |
| Talk page | `/wiki/Talk:<Entity>` | Real bull-vs-bear debate sections with color-coded perspective pills + Supersession Log |
| Revision history | `/wiki/<Entity>?action=history` | Every claim ingestion sorted newest-first, with sub-tenant pill, confidence, source |
| What Links Here | `/special/links/<Entity>` | Other entity articles whose claims mention this entity (HydraDB global recall + content match) |
| Recent Changes | `/special/recent` | Live feed of every claim agents have written, grouped by entity and sub-tenant |
| Cmd+K palette | `⌘K` anywhere | Ask Embodipedia anything → GPT-4o synthesizes a cited answer + draws an SVG entity graph |

---

## 🧠 How it actually works

```
   ┌──────────┐     ┌─────────┐     ┌──────────────────┐     ┌─────────────┐
   │  Ingest  │ →   │ Extract │ →   │      Route       │ →   │  Synthesize │
   └──────────┘     └─────────┘     └──────────────────┘     └─────────────┘
   tweets · papers   GPT-4o-mini    perspective_router       GPT-4o
   podcasts · news   typed claims   canonical/bull/bear      Wikipedia prose
                     + confidence   (HydraDB sub-tenants)    + footnotes
                                                             + [unverified]
```

**Key insight:** routing happens per-claim, not per-source. A single Brett Adcock interview can simultaneously contribute a `canonical` deployment fact ("Figure robots are at BMW Spartanburg") *and* a `bull` forward-looking claim ("tens of thousands of robots by 2026"). The Talk page then recalls each lane separately, runs them through a debate synthesizer, and renders the disagreement.

---

## 🏛 Repository layout

```
apps/
  web/                          Next.js 15 App Router + RSC
    app/
      page.tsx                  Portal homepage
      wiki/[slug]/              Article, Talk, History (server components)
      special/recent/           Recent changes feed
      special/links/            What Links Here
    components/
      CommandPalette.tsx        ⌘K global shortcut → /api/ask
      EntityGraph.tsx           SVG force-directed graph viz
      TimeTravelSlider.tsx      Snapshot-date scrubber
      StaleBanner.tsx           Self-healing trigger
      Infobox.tsx               Wikipedia-style sidebar
    lib/
      api.ts                    Typed FastAPI client
      markdown.ts               Tiny Wikipedia-flavoured renderer

  agents/                       Python FastAPI + HydraDB SDK
    main.py                     /api/wiki, /api/talk, /api/ask, /api/links,
                                /api/history, /api/recent, /api/refresh
    hydradb_client.py           Wrapper over hydra_db SDK (commented per call)
    perspective_router.py       Claim → {canonical, bull, bear} routing
    synthesis_agent.py          Article body synthesis + as_of time-travel
    talk_synthesizer.py         Bull/bear lane recall → debate sections
    extractors/
      tweet_agent.py            LLM extraction from tweets
      paper_agent.py            LLM extraction from arXiv abstracts
      transcript_agent.py       LLM extraction from podcasts / talks
      news_agent.py             LLM extraction from news articles

data/
  seed_tweets.yaml              5 hand-pasted Brett Adcock tweets
  seed_claims.yaml              76 hand-curated claims across 15 entities
  seed_sources_phase2.yaml      5 papers + 4 transcripts + 4 news for LLM

scripts/
  ingest_tweets.py              Ingest seed tweets via LLM extractor
  ingest_seed_claims.py         Ingest hand-curated claims directly
  ingest_sources.py             Run LLM extraction on phase 2 sources
```

---

## 🚀 Running locally

```bash
# 1. Environment
cp .env.example .env       # fill in HYDRADB_API_KEY + OPENAI_API_KEY

# 2. Python deps
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/agents/requirements.txt

# 3. Node deps
cd apps/web && npm install && cd ../..

# 4. Backend (Terminal 1)
PYTHONPATH=. .venv/bin/uvicorn apps.agents.main:app --reload

# 5. Frontend (Terminal 2)
cd apps/web && npm run dev

# 6. Ingest corpus (Terminal 3)
PYTHONPATH=. python3 -m scripts.ingest_seed_claims     # 76 curated claims
PYTHONPATH=. python3 -m scripts.ingest_tweets          # 5 tweets → ~19 claims
PYTHONPATH=. python3 -m scripts.ingest_sources         # 13 sources → ~50 claims
```

Then open <http://localhost:3000>.

---

## 🎯 90-second demo

1. **Portal** (`/`) — 15 entities, 4-step pipeline diagram.
2. **Article** (`/wiki/Figure_02`) — Featured badge, infobox, citation hover previews.
3. **Time-travel** — drag slider to Jan 2024 — article re-renders with fewer claims and a yellow notice.
4. **Talk page** — bull vs bear debate sections with color pills + footnotes.
5. **Cmd+K** — ask "How does NVIDIA GR00T connect to Figure AI?" — read cited answer, see entity graph, click a node.
6. **History tab** — scroll the live ingestion log.

---

## 🛠 Tech stack

- **Frontend:** Next.js 15 App Router + RSC · TypeScript · Tailwind v4 · custom Wikipedia CSS
- **Backend:** FastAPI · OpenAI GPT-4o + GPT-4o-mini · Pydantic v2
- **Memory:** HydraDB (5 sub-tenants: canonical / bull / bear / articles / agents) · hybrid + sub-tenant + boolean recall
- **No external dependencies for entity-graph viz** — pure SVG with a tiny deterministic layout

---

## 📜 License + acknowledgements

Built solo in 48 hours for WikiThon 2026.
Source at <https://github.com/sagarbpatel31/EMBODIPEDIA>.

Special thanks to the HydraDB team for an SDK that made the multi-perspective architecture possible without writing my own vector store.
