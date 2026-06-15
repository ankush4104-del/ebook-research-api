# AGENT_HANDOFF.md

This document allows a new AI agent or developer to continue work on this project without reading any prior chat history. Read this file first, then `PROJECT_STATUS.md` for full context.

---

## Project Goals

Build a research-focused REST API that serves as the backend for a Custom GPT that generates publishing-ready ebooks. The API gathers real research data from Tavily (web search) and Crossref (academic papers) and returns it as structured JSON. **The API does not generate content** — it provides planning data only. The Custom GPT calls these endpoints as GPT Actions before writing.

---

## Completed Work

| # | Endpoint | Data Sources | Output Fields |
|---|----------|--------------|---------------|
| 1 | `GET /api/healthz` | — | `status` |
| 2 | `POST /api/research` | Tavily + Crossref | 9 fields |
| 3 | `POST /api/outline` | Tavily | 9 fields |
| 4 | `POST /api/citations` | Crossref | 3 fields |
| 5 | `POST /api/kdp-research` | Tavily | 8 fields |
| 6 | `POST /api/kdp-keywords` | Tavily | 11 fields |
| 7 | `POST /api/book-market-research` | Tavily | 10 fields |
| 8 | `POST /api/chapter-research` | Tavily + Crossref | 15 fields |

**Infrastructure completed:**
- pnpm monorepo with TypeScript project references
- Contract-first OpenAPI 3.1 spec with Orval codegen
- Zod validation on all request bodies (generated from spec)
- Pino structured logging (`logger` singleton + `req.log` in routes)
- CORS enabled for all origins
- Express 5 with `express.json()` body parsing
- Replit workflow running server on injected `PORT` env var
- `TAVILY_API_KEY` secret configured and working
- All 8 endpoints live-tested with real Tavily and Crossref data

---

## Architecture Overview

```
pnpm monorepo — Node.js 24, TypeScript 5.9
├── artifacts/api-server/     — Express 5 API (the only deployed service)
├── lib/api-spec/             — ⭐ OpenAPI 3.1 spec + Orval codegen config
├── lib/api-zod/              — Generated Zod schemas (consumed by api-server)
├── lib/api-client-react/     — Generated React Query hooks (unused — for future UI)
└── lib/db/                   — Drizzle ORM schema (not yet used — no DB needed)
```

### How a new endpoint is built (always follow this order)

1. Add the path + schemas in `lib/api-spec/openapi.yaml`
2. Run codegen: `pnpm --filter @workspace/api-spec run codegen`
3. Create `artifacts/api-server/src/lib/<endpoint>.ts` — business logic
4. Create `artifacts/api-server/src/routes/<endpoint>.ts` — Express route using generated Zod body
5. Register the router in `artifacts/api-server/src/routes/index.ts`
6. Run typecheck: `pnpm --filter @workspace/api-server run typecheck`
7. Restart the workflow
8. Test: `curl -X POST localhost:80/api/<endpoint> -H "Content-Type: application/json" -d '{...}'`

### Critical rules

- **Never edit generated files** in `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/`
- **Never use `console.log`** — use `req.log` in route handlers, `logger` singleton elsewhere
- **Never hardcode PORT** — it is injected at runtime
- **Never run `pnpm dev` at the workspace root** — use the Replit workflow
- **Test via port 80** (the shared proxy): `curl localhost:80/api/...`
- **`lib/api-zod/src/index.ts` barrel** must stay as: `export * from "./generated/api"; export type * from "./generated/types"`
- **`info.title` in openapi.yaml** must remain `Api` — changing it breaks generated import paths
- All routes must use Zod bodies generated from the spec

---

## File Structure Overview

```
/
├── artifacts/
│   └── api-server/
│       ├── .replit-artifact/artifact.toml  — Service config (paths, build, run, health check)
│       └── src/
│           ├── app.ts                      — Express app setup (middleware, CORS, router mount)
│           ├── index.ts                    — Server entrypoint (binds to PORT)
│           ├── routes/
│           │   ├── index.ts                — Router aggregator (imports + mounts all routes)
│           │   ├── health.ts
│           │   ├── research.ts
│           │   ├── outline.ts
│           │   ├── citations.ts
│           │   ├── kdp-research.ts
│           │   ├── kdp-keywords.ts
│           │   ├── book-market-research.ts
│           │   └── chapter-research.ts
│           └── lib/
│               ├── logger.ts               — Pino logger singleton
│               ├── research.ts             — Tavily + Crossref research logic
│               ├── outline.ts              — Outline builder with length/type configs
│               ├── citations.ts            — Crossref fetcher + APA/MLA/Chicago/Harvard formatters
│               ├── kdp.ts                  — KDP research logic
│               ├── kdp-keywords.ts         — KDP keyword research logic
│               ├── book-market-research.ts — Market viability research logic
│               └── chapter-research.ts     — Deep chapter research (Tavily + Crossref)
│
├── lib/
│   ├── api-spec/
│   │   ├── openapi.yaml                    — ⭐ Source of truth (GPT Actions import this)
│   │   └── orval.config.ts                 — Codegen config
│   ├── api-zod/
│   │   └── src/
│   │       ├── index.ts                    — Barrel: export * from generated/api
│   │       └── generated/                  — ⚠️ Do not edit — overwritten by codegen
│   ├── api-client-react/
│   │   └── src/generated/                  — ⚠️ Do not edit — overwritten by codegen
│   └── db/
│       └── src/schema/index.ts             — Drizzle schema (unused)
│
├── PROJECT_STATUS.md
├── AGENT_HANDOFF.md                        — This file
├── API_DOCUMENTATION.md
├── DEPLOYMENT_GUIDE.md
├── GPT_ACTION_SETUP.md
└── FINAL_PROJECT_SUMMARY.md
```

---

## Endpoint Descriptions

### GET /api/healthz
No input. Returns `{ "status": "ok" }`. Use for health checks and uptime monitoring.

---

### POST /api/research
General topic research for book creation.

**Input:** `{ topic, book_type: "ebook|nonfiction|training_manual", target_audience }`

**Output:** `topic`, `summary`, `key_concepts[]`, `chapter_ideas[]`, `industry_trends[]`, `statistics[{fact,source}]`, `case_studies[{title,summary}]`, `sources[{title,url}]`, `academic_references[{title,authors,doi}]`

**Data sources:** Tavily (3 parallel searches: overview, trends, statistics) + Crossref (5 academic papers)

---

### POST /api/outline
Full book outline with chapter-by-chapter plan. Word count and chapter count auto-scale by the `length` enum.

**Input:** `{ topic, book_type: "ebook|nonfiction|training_manual", target_audience, length: "5000-10000|10000-20000|20000-50000|50000-75000|75000+" }`

**Output:** `topic`, `recommended_title`, `subtitle_options[]`, `recommended_structure`, `reader_transformation`, `book_promise`, `chapters[{chapter_number,chapter_title,objective,key_topics[],estimated_words}]`, `total_estimated_words`, `recommended_resources[]`

**Chapter counts:** 5000-10000 → 6ch | 10000-20000 → 10ch | 20000-50000 → 14ch | 50000-75000 → 20ch | 75000+ → 26ch

**Data sources:** Tavily

---

### POST /api/citations
Real academic citations from Crossref, formatted in the requested style.

**Input:** `{ topic, style: "APA|MLA|Chicago|Harvard" }`

**Output:** `topic`, `style`, `references[{title,authors,year,doi,citation}]`

Up to 10 results. Each `citation` is a fully formatted string in the requested style.

**Data sources:** Crossref only (no Tavily)

---

### POST /api/kdp-research
Amazon/KDP market data for a book topic.

**Input:** `{ topic, book_type: "ebook|nonfiction|training_manual", target_audience }`

**Output:** `topic`, `keywords[]` (up to 7), `categories[{name,bisac_code}]`, `competitive_titles[{title,author,url,price_range}]`, `market_insights[]`, `pricing_suggestion{ebook_price,print_price,rationale}`, `description_hooks[]`, `title_keywords[]`

**Data sources:** Tavily

---

### POST /api/kdp-keywords
Focused KDP keyword research for Amazon discoverability.

**Input:** `{ topic }`

**Output:** `topic`, `primary_keywords[]`, `long_tail_keywords[]`, `buyer_intent_keywords[]`, `category_keywords[]`, `subtitle_suggestions[]`, `recommended_categories[]`, `target_audiences[]`, `keyword_difficulty`, `discoverability_score`, `positioning_suggestions[]`

**Data sources:** Tavily (2 parallel searches: general + Amazon-specific)

---

### POST /api/book-market-research
Market viability assessment for a proposed book topic.

**Input:** `{ topic }`

**Output:** `market_demand`, `competition_level`, `target_audiences[]`, `popular_subtopics[]`, `content_gaps[]`, `positioning_recommendations[]`, `keyword_opportunities[]`, `monetization_potential`, `recommended_positioning`, `recommended_angles[]`

**Data sources:** Tavily

---

### POST /api/chapter-research
Deep research for a single chapter. Returns 15 planning fields.

**Input:** `{ topic, chapter_title, target_audience }`

**Output:** `chapter_title`, `summary`, `learning_objectives[]`, `key_concepts[]`, `important_subtopics[]`, `industry_trends[]`, `statistics[{fact,source}]`, `case_studies[{title,summary}]`, `expert_insights[]`, `common_mistakes[]`, `action_steps[]`, `recommended_examples[]`, `recommended_frameworks[]`, `academic_references[]` (APA strings), `sources[]` (URLs)

**Data sources:** Tavily (3 parallel searches: stats/trends, cases/insights, frameworks/mistakes) + Crossref (6 papers, APA-formatted)

---

## Tavily Requirements

- **Key:** `TAVILY_API_KEY` environment variable (set in Replit Secrets or Render env vars)
- **Endpoint:** `https://api.tavily.com/search` (POST)
- **Auth:** `api_key` field in JSON body
- **Pattern:** Each lib function builds targeted search queries and runs them in parallel with `Promise.all()`
- **Search depths used:** `"advanced"` (most searches) and `"basic"` (lighter lookups)
- **Max results:** 7–10 per search
- **Without the key:** All Tavily-powered endpoints throw `"TAVILY_API_KEY is not configured"` and return HTTP 500

---

## Crossref Requirements

- **Endpoint:** `https://api.crossref.org/works` (GET with query params)
- **Auth:** None required (public API)
- **Required header:** `User-Agent: BookResearchAPI/1.0 (mailto:research@example.com)` — required for polite pool access; without it, Crossref may rate-limit or block requests
- **Query params:** `query=<topic>&rows=<n>&select=title,author,DOI,container-title,issued,publisher,URL,volume,issue,page,type`
- **Filter:** Only items with both `title` and `DOI` are used in responses
- **Error handling:** Returns empty array on any failure — does not block the response

---

## OpenAPI File Location

```
lib/api-spec/openapi.yaml
```

This is the **single source of truth** for all schemas and endpoint contracts.

- Import this file directly into a Custom GPT as the Action schema
- Before importing, update `servers[0].url` from `/api` to the absolute production URL
- After any spec change, run: `pnpm --filter @workspace/api-spec run codegen`

---

## Environment Variables

| Variable | Required | Where to Set | Description |
|----------|----------|--------------|-------------|
| `TAVILY_API_KEY` | ✅ Yes | Replit Secrets or Render env vars | Tavily Search API key |
| `PORT` | Auto-injected | Runtime (Replit/Render) | Never hardcode — injected automatically |
| `SESSION_SECRET` | Optional | Replit Secrets or Render env vars | Reserved for future auth; not used by any route |
| `DATABASE_URL` | Not yet needed | — | Only if `lib/db` (Drizzle) is activated |

---

## Deployment Requirements

### Replit deployment
- Click Deploy in Replit → Autoscale or Reserved VM
- Build command (configured in `artifact.toml`): `pnpm --filter @workspace/api-server run build`
- Start command: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
- Health check: `GET /api/healthz` → must return HTTP 200
- Set `TAVILY_API_KEY` in Replit Secrets before deploying

### Render deployment
- Build command: `pnpm install && pnpm --filter @workspace/api-server run build`
- Start command: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
- Health check path: `/api/healthz`
- Environment variables to set: `TAVILY_API_KEY`, `NODE_ENV=production`
- `PORT` is injected automatically by Render — do not set it manually
- See `DEPLOYMENT_GUIDE.md` for full Render setup instructions

---

## Render Deployment Notes

- Render injects `PORT` automatically as an environment variable — the server reads it correctly
- The server throws on startup if `PORT` is missing, so Render's injection is required
- The monorepo root does not have a `dev` script — always use the explicit filter: `pnpm --filter @workspace/api-server run build`
- The built output is at `artifacts/api-server/dist/index.mjs` (ESM bundle via esbuild)
- Pino logging writes structured JSON to stdout — Render captures this in its log viewer
- The Render free tier may cold-start (spin down after 15 minutes of inactivity) — use the health check endpoint to prime the server before GPT Action calls if needed

---

## GPT Actions Integration Notes

- The OpenAPI spec at `lib/api-spec/openapi.yaml` is GPT Actions-compatible as-is
- **Required change before import:** Update `servers[0].url` to the absolute production URL (e.g. `https://your-app.onrender.com/api`)
- **Authentication:** Currently none — set Auth to **None** in the GPT Actions editor
- **`info.title`** must remain `Api` — changing it breaks generated TypeScript import paths
- All 8 endpoints will appear in the GPT Actions editor after import
- The Custom GPT should call `/research` and `/outline` first to build foundational context, then call `/chapter-research` per chapter
- Use `/kdp-keywords` and `/kdp-research` together for complete KDP metadata
- Use `/book-market-research` before committing to a topic to assess viability

---

## Pending Endpoints (Not Yet Built)

These were discussed but not implemented. Ordered by recommended implementation priority:

| Priority | Endpoint | Purpose | Complexity |
|----------|----------|---------|------------|
| 1 | `POST /book-description` | KDP-ready Amazon description with hook, bullets, CTA | Low |
| 2 | `POST /introduction-planner` | Structured plan for book intro (hook, credibility, roadmap) | Low |
| 3 | `POST /conclusion-planner` | Structured plan for book conclusion (takeaways, CTA) | Low |
| 4 | `POST /author-bio` | 3 bio variants (short/medium/long) formatted for KDP | Low |
| 5 | `POST /faq-research` | Top 10–15 reader questions on a topic via Tavily | Low |
| 6 | `POST /back-cover-copy` | Back cover text formatted for print-on-demand | Low |
| 7 | `POST /series-planner` | Multi-book series plan with topic progression | Medium |
| 8 | `POST /expert-quotes` | Quotable expert statements via web research | Medium |
| 9 | `POST /reading-list` | Annotated recommended reading list for a topic | Medium |

---

## Quick Start for a New Session

```bash
# 1. Install dependencies
pnpm install

# 2. Verify the server is running (after starting the workflow)
curl -s localhost:80/api/healthz
# → {"status":"ok"}

# 3. After any spec change, always run codegen before typecheck
pnpm --filter @workspace/api-spec run codegen

# 4. Typecheck the entire workspace
pnpm run typecheck

# 5. Test an endpoint
curl -s -X POST localhost:80/api/research \
  -H "Content-Type: application/json" \
  -d '{"topic":"mindfulness","book_type":"ebook","target_audience":"beginners"}'
```

For the full API contract, see `lib/api-spec/openapi.yaml`.
For deployment instructions, see `DEPLOYMENT_GUIDE.md`.
