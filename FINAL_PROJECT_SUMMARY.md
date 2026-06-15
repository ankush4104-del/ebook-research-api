# Final Project Summary

## Project Purpose

A research-focused REST API that serves as the data layer for a Custom GPT ebook generator. The API gathers real, structured research from Tavily (web search) and Crossref (academic papers) and returns it as typed JSON. **The API does not generate content** — it provides planning data that the Custom GPT uses to write publishing-ready ebooks.

The workflow is:
1. Custom GPT calls `/book-market-research` to validate the topic
2. Custom GPT calls `/research` for foundational topic research
3. Custom GPT calls `/outline` to get a chapter-by-chapter plan
4. Custom GPT calls `/chapter-research` for each chapter (one call per chapter)
5. Custom GPT calls `/kdp-keywords` and `/kdp-research` for Amazon publishing metadata
6. Custom GPT calls `/citations` for academic references
7. Custom GPT writes the ebook using the structured research data as its source of truth

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 24 |
| Language | TypeScript 5.9 (strict) |
| Framework | Express 5 |
| Package manager | pnpm (monorepo with workspaces) |
| Validation | Zod v4 (generated from OpenAPI spec via Orval) |
| API spec | OpenAPI 3.1.0 |
| Codegen | Orval (generates Zod schemas and React Query hooks) |
| Logging | Pino (structured JSON logging) |
| Build | esbuild (produces ESM bundle at `artifacts/api-server/dist/index.mjs`) |
| DB (dormant) | Drizzle ORM + PostgreSQL (schema present, not yet activated) |

---

## Endpoint Inventory

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/api/healthz` | Server health check |
| 2 | POST | `/api/research` | General topic research (Tavily + Crossref) |
| 3 | POST | `/api/outline` | Full book outline with chapter plan (Tavily) |
| 4 | POST | `/api/citations` | Academic citations in APA/MLA/Chicago/Harvard (Crossref) |
| 5 | POST | `/api/kdp-research` | KDP keywords, BISAC categories, competitive titles, pricing (Tavily) |
| 6 | POST | `/api/kdp-keywords` | Amazon KDP keyword discoverability research (Tavily) |
| 7 | POST | `/api/book-market-research` | Book topic market viability assessment (Tavily) |
| 8 | POST | `/api/chapter-research` | Deep chapter research — 15 planning fields (Tavily + Crossref) |

All 8 endpoints are live, tested with real API data, and return correctly structured JSON.

---

## Research Capabilities

### Web Research (via Tavily)

- **General research:** Overview, trends, statistics, case studies, and sources for any topic
- **Outline research:** Tavily-informed chapter structure, subtitle options, and resource recommendations
- **Market research:** Demand signals, competition assessment, content gaps, positioning opportunities
- **KDP research:** Amazon market data — keywords, BISAC categories, competitive titles, pricing benchmarks
- **Keyword research:** Primary, long-tail, buyer-intent, and category keywords for Amazon discoverability
- **Chapter research:** Deep search across three query types (statistics/trends, cases/insights, frameworks/mistakes)

All Tavily searches run in parallel using `Promise.all()` to minimise response latency.

### Academic Research (via Crossref)

- **Topic citations:** Up to 10 real academic papers filtered to those with both a title and a DOI
- **Citation formatting:** Automatic formatting in APA 7th, MLA 9th, Chicago 17th, or Harvard
- **Chapter references:** Up to 6 APA-formatted academic citations per chapter
- **Research references:** Up to 5 Crossref papers included in general `/research` responses

Crossref requires no API key and is accessed via the public polite pool with a `User-Agent` header.

---

## KDP Publishing Capabilities

The API provides a complete set of tools for Amazon KDP publishing metadata:

| Capability | Endpoint | Output |
|------------|----------|--------|
| Backend keywords (up to 7) | `/kdp-research` | `keywords[]` |
| BISAC category codes | `/kdp-research` | `categories[]` with `bisac_code` |
| Competitive title analysis | `/kdp-research` | `competitive_titles[]` with prices |
| Ebook + print pricing | `/kdp-research` | `pricing_suggestion` with rationale |
| Description hook lines | `/kdp-research` | `description_hooks[]` |
| Title keyword extraction | `/kdp-research` | `title_keywords[]` |
| Long-tail keyword research | `/kdp-keywords` | `long_tail_keywords[]` |
| Buyer-intent keywords | `/kdp-keywords` | `buyer_intent_keywords[]` |
| Subtitle recommendations | `/kdp-keywords` | `subtitle_suggestions[]` |
| Keyword difficulty assessment | `/kdp-keywords` | `keyword_difficulty` (narrative) |
| Discoverability score | `/kdp-keywords` | `discoverability_score` (rated /10) |
| KDP positioning guidance | `/kdp-keywords` | `positioning_suggestions[]` |
| Market demand assessment | `/book-market-research` | `market_demand` |
| Competition level | `/book-market-research` | `competition_level` |
| Content gap analysis | `/book-market-research` | `content_gaps[]` |
| Monetization potential | `/book-market-research` | `monetization_potential` |

---

## GPT Integration Capabilities

The API is designed end-to-end for Custom GPT integration via GPT Actions:

- **OpenAPI 3.1 spec** at `lib/api-spec/openapi.yaml` is GPT Actions-compatible
- **8 operationIds** defined — each maps to a distinct action in the GPT Actions editor
- **All schemas defined as components** — no inline schema duplication, clean GPT rendering
- **All required fields marked** — GPT correctly identifies what it must supply
- **No authentication required** — GPT Actions auth setting: None
- **Structured JSON responses** — every field is typed, named, and described in the spec
- **Graceful partial responses** — Crossref failures return empty arrays rather than hard errors, so the GPT always receives a usable response

**Recommended Custom GPT workflow order:**

```
1. /book-market-research  → validate topic viability
2. /research              → gather foundational knowledge
3. /outline               → generate chapter structure
4. /chapter-research      → deep research per chapter (loop)
5. /citations             → academic references for the book
6. /kdp-keywords          → Amazon keyword strategy
7. /kdp-research          → full KDP publishing metadata
```

---

## Future Enhancement Ideas

### High-value next endpoints (ready to build, low complexity)

| Endpoint | Purpose |
|----------|---------|
| `POST /book-description` | KDP-ready Amazon book description — hook, benefit bullets, body, CTA, full + short variants |
| `POST /introduction-planner` | Structured plan for book intro — hook options, credibility setup, problem statement, roadmap |
| `POST /conclusion-planner` | Structured plan for book conclusion — takeaways, transformation statement, CTA options |
| `POST /author-bio` | 3 bio variants (50/150/300 words) formatted for KDP |
| `POST /faq-research` | Top 10–15 reader questions on a topic via Tavily |
| `POST /back-cover-copy` | Back cover text formatted for print-on-demand |

### Medium complexity future endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /series-planner` | Multi-book series plan with topic progression and cross-book positioning |
| `POST /expert-quotes` | Quotable expert statements on a topic from web research |
| `POST /reading-list` | Annotated recommended reading list for a topic |

### Infrastructure enhancements

| Enhancement | Description |
|-------------|-------------|
| API key authentication | Single middleware in `app.ts` checking `Authorization: Bearer <token>` — prevents unauthorised use once the URL is shared |
| Request caching | Cache Tavily responses for repeated identical queries to reduce API costs and improve latency |
| Rate limiting | Express rate limiter middleware to prevent abuse |
| Database activation | Activate `lib/db` (Drizzle + PostgreSQL) to store research results for retrieval without re-querying Tavily |
| OpenAPI spec serving | Add a `GET /api/openapi.yaml` route to serve the spec file — enables GPT Actions import-from-URL |
| Streaming responses | Stream structured JSON chunks for long-running chapter research calls to improve perceived performance |
