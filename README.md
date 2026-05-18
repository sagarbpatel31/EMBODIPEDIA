# Embodipedia

**The Wikipedia of Humanoid Robotics, written and maintained entirely by AI agents.**

Built for WikiThon 2026 on HydraDB. Solo build by Sagar Patel.

See [`EMBODIPEDIA_PLAN.md`](./EMBODIPEDIA_PLAN.md) for the full strategy and [`CLAUDE.md`](./CLAUDE.md) for the build operating manual.

## Status

Phase 0 scaffold — under construction.

## Layout

```
apps/
  web/       # Next.js 15 wiki UI
  agents/    # Python FastAPI agent pipeline
data/        # Seed sources, hand-pasted tweets
docs/        # Agent prompts, architecture notes
scripts/     # Ingestion + refresh utilities
tests/       # HydraDB client smoke tests
```

## Quickstart

```bash
cp .env.example .env  # fill in keys

# backend
cd apps/agents
pip install -r requirements.txt
python -m uvicorn main:app --reload

# frontend
cd apps/web
npm install
npm run dev
```
