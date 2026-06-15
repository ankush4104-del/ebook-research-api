# API Documentation

A research-focused REST API that serves as the backend for a Custom GPT that generates publishing-ready ebooks. All endpoints return structured planning and research data only — **no content is generated**.

---

## Base URL

| Environment | Base URL |
|-------------|----------|
| Development (Replit) | `https://<your-replit-dev-domain>/api` |
| Production (Render) | `https://<your-service-name>.onrender.com/api` |
| Production (Replit Deploy) | `https://<your-repl-name>.replit.app/api` |

The `/api` prefix is required on all requests.

---

## Authentication

This API currently has **no authentication layer**. All endpoints are publicly accessible to any caller with the URL. CORS is enabled for all origins.

---

## Error Responses

All endpoints return a consistent error shape:

**400 Bad Request** — request body failed Zod validation:
```json
{ "error": "<zod validation message>" }
```

**500 Internal Server Error** — unhandled exception (missing API key, upstream failure):
```json
{ "error": "<message>" }
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TAVILY_API_KEY` | ✅ Yes | Tavily Search API key. Without this, all Tavily-powered endpoints return HTTP 500. |
| `PORT` | Auto-injected | Injected at runtime by Replit or Render. Never hardcode. |
| `SESSION_SECRET` | Optional | Reserved — not consumed by any route. |
| `DATABASE_URL` | Not yet needed | Only required if the Drizzle/PostgreSQL layer is activated. |

---

## Endpoint Index

| Method | Path | Data Sources | Summary |
|--------|------|--------------|---------|
| GET | `/api/healthz` | — | Server health check |
| POST | `/api/research` | Tavily + Crossref | General topic research for book creation |
| POST | `/api/outline` | Tavily | Full book outline with chapter plan |
| POST | `/api/citations` | Crossref | Formatted academic citations |
| POST | `/api/kdp-research` | Tavily | KDP keywords, BISAC categories, pricing |
| POST | `/api/kdp-keywords` | Tavily | Amazon KDP keyword discoverability research |
| POST | `/api/book-market-research` | Tavily | Book topic market viability assessment |
| POST | `/api/chapter-research` | Tavily + Crossref | Deep research for a single chapter |

---

## GET /api/healthz

Returns server health status. No input required. Use this to verify the server is running before making data requests.

**Data sources:** None

**Request:** No body required.

**Response `200`:**
```json
{ "status": "ok" }
```

**Example:**
```bash
curl https://<your-app>/api/healthz
```

---

## POST /api/research

General-purpose topic research for book creation. Queries Tavily (web) and Crossref (academic) and returns broad foundational research structured for ebook planning.

**Data sources:** Tavily (3 parallel searches: overview, trends, statistics) + Crossref (5 academic papers)

### Request body

```json
{
  "topic": "string",
  "book_type": "ebook | nonfiction | training_manual",
  "target_audience": "string"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | ✅ | The book topic to research |
| `book_type` | enum | ✅ | `ebook`, `nonfiction`, or `training_manual` |
| `target_audience` | string | ✅ | Description of the intended reader |

### Response `200`

```json
{
  "topic": "string",
  "summary": "string",
  "key_concepts": ["string"],
  "chapter_ideas": ["string"],
  "industry_trends": ["string"],
  "statistics": [
    { "fact": "string", "source": "string" }
  ],
  "case_studies": [
    { "title": "string", "summary": "string" }
  ],
  "sources": [
    { "title": "string", "url": "string" }
  ],
  "academic_references": [
    { "title": "string", "authors": "string", "doi": "string" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `topic` | string | Echo of the input topic |
| `summary` | string | 1–3 sentence overview synthesised from Tavily's answer |
| `key_concepts` | string[] | Up to 8 core concepts extracted from web research |
| `chapter_ideas` | string[] | Suggested chapter titles tailored to `book_type` and `target_audience` |
| `industry_trends` | string[] | Up to 6 trend sentences from recent web sources |
| `statistics` | object[] | Up to 8 data points; each has `fact` (string) and `source` (URL string) |
| `case_studies` | object[] | Up to 4 real-world examples; each has `title` and `summary` |
| `sources` | object[] | Up to 10 deduplicated web sources; each has `title` and `url` |
| `academic_references` | object[] | Up to 5 Crossref papers; each has `title`, `authors`, and `doi` |

### Example request

```bash
curl -X POST https://<your-app>/api/research \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "content marketing",
    "book_type": "ebook",
    "target_audience": "small business owners"
  }'
```

### Example response (abbreviated)

```json
{
  "topic": "content marketing",
  "summary": "Content marketing involves creating valuable content to attract and engage an audience, helping small businesses build trust and generate leads without paid advertising.",
  "key_concepts": [
    "Content Strategy",
    "SEO Optimisation",
    "Audience Segmentation",
    "Lead Generation",
    "Brand Storytelling",
    "Editorial Calendar",
    "Content Distribution",
    "Conversion Funnel"
  ],
  "chapter_ideas": [
    "Introduction to Content Marketing",
    "Why Content Marketing Matters in Today's World",
    "Core Concepts and Fundamentals",
    "Getting Started: Your First Steps",
    "Advanced Strategies and Techniques",
    "Real-World Applications",
    "Common Mistakes to Avoid",
    "Building Your Content Marketing Action Plan"
  ],
  "industry_trends": [
    "AI-assisted content creation is reshaping editorial workflows across the industry"
  ],
  "statistics": [
    { "fact": "70% of marketers are actively investing in content marketing", "source": "https://contentmarketinginstitute.com" }
  ],
  "case_studies": [
    { "title": "How HubSpot Built an Inbound Empire", "summary": "HubSpot used content marketing to grow from startup to publicly listed company by publishing thousands of practical blog posts..." }
  ],
  "sources": [
    { "title": "Content Marketing Institute 2024 Report", "url": "https://contentmarketinginstitute.com/report" }
  ],
  "academic_references": [
    { "title": "The Effects of Content Marketing on Consumer Engagement", "authors": "Smith, J., Lee, K.", "doi": "10.1016/j.jbusres.2023.01.001" }
  ]
}
```

---

## POST /api/outline

Generates a complete, research-backed book outline. Uses Tavily to inform chapter structure, word count targets, and subtitle options. Returns planning data only — no content is generated.

**Data sources:** Tavily

### Request body

```json
{
  "topic": "string",
  "book_type": "ebook | nonfiction | training_manual",
  "target_audience": "string",
  "length": "5000-10000 | 10000-20000 | 20000-50000 | 50000-75000 | 75000+"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | ✅ | The book topic |
| `book_type` | enum | ✅ | `ebook`, `nonfiction`, or `training_manual` |
| `target_audience` | string | ✅ | Description of the intended reader |
| `length` | enum | ✅ | Target word count range — controls chapter count |

**Chapter count by length:**

| `length` | Chapters | Target words |
|----------|----------|--------------|
| `5000-10000` | 6 | ~7,500 |
| `10000-20000` | 10 | ~15,000 |
| `20000-50000` | 14 | ~35,000 |
| `50000-75000` | 20 | ~62,500 |
| `75000+` | 26 | ~85,000 |

### Response `200`

```json
{
  "topic": "string",
  "recommended_title": "string",
  "subtitle_options": ["string"],
  "recommended_structure": "string",
  "reader_transformation": "string",
  "book_promise": "string",
  "chapters": [
    {
      "chapter_number": 1,
      "chapter_title": "string",
      "objective": "string",
      "key_topics": ["string"],
      "estimated_words": 1500
    }
  ],
  "total_estimated_words": 15000,
  "recommended_resources": ["string"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `recommended_title` | string | Single best-fit book title based on research |
| `subtitle_options` | string[] | 5 subtitle candidates embedding key phrases |
| `recommended_structure` | string | Narrative description of the book's overall arc |
| `reader_transformation` | string | Before/after statement describing the reader's transformation |
| `book_promise` | string | One sentence describing the core value the reader gets |
| `chapters` | object[] | Array of chapter objects (see below) |
| `total_estimated_words` | integer | Sum of all chapter word estimates |
| `recommended_resources` | string[] | Books, tools, and resources the author should reference |

**Chapter object:**

| Field | Type | Description |
|-------|------|-------------|
| `chapter_number` | integer | 1-indexed chapter sequence |
| `chapter_title` | string | Title of the chapter |
| `objective` | string | Single learning objective for this chapter |
| `key_topics` | string[] | Subtopics and concepts covered |
| `estimated_words` | integer | Estimated word count for this chapter |

### Example request

```bash
curl -X POST https://<your-app>/api/outline \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "content marketing",
    "book_type": "ebook",
    "target_audience": "small business owners",
    "length": "10000-20000"
  }'
```

### Example response (abbreviated)

```json
{
  "topic": "content marketing",
  "recommended_title": "The Practical Content Marketing Guide",
  "subtitle_options": [
    "A Step-by-Step Guide for Small Business Owners",
    "From Zero to Consistent Traffic Without Paid Ads",
    "Proven Frameworks, Real Results, No Agency Required",
    "The No-Fluff Guide to Content Marketing for Busy Owners",
    "How to Attract Customers with Content on a Bootstrap Budget"
  ],
  "recommended_structure": "Begins with strategy foundations, moves through channel-specific execution, and closes with measurement and scaling.",
  "reader_transformation": "Readers move from ad-dependent businesses to self-sustaining content engines that attract customers organically.",
  "book_promise": "A practical playbook that gives small business owners a repeatable content system that attracts customers without paid advertising.",
  "chapters": [
    {
      "chapter_number": 1,
      "chapter_title": "Why Content Marketing Works for Small Businesses",
      "objective": "Establish the case for content marketing as the highest-ROI channel for budget-constrained owners",
      "key_topics": ["organic vs paid traffic", "trust and authority", "content ROI benchmarks"],
      "estimated_words": 1400
    }
  ],
  "total_estimated_words": 14367,
  "recommended_resources": [
    "Content Marketing Institute Blog",
    "Ahrefs Academy",
    "They Ask You Answer by Marcus Sheridan"
  ]
}
```

---

## POST /api/citations

Searches Crossref for real academic papers on a topic and returns structured reference objects with fully formatted citations in the requested style.

**Data sources:** Crossref only (no Tavily)

### Request body

```json
{
  "topic": "string",
  "style": "APA | MLA | Chicago | Harvard"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | ✅ | The topic to find academic citations for |
| `style` | enum | ✅ | `APA`, `MLA`, `Chicago`, or `Harvard` |

### Response `200`

```json
{
  "topic": "string",
  "style": "APA | MLA | Chicago | Harvard",
  "references": [
    {
      "title": "string",
      "authors": "string",
      "year": "string",
      "doi": "string",
      "citation": "string"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `references` | object[] | Up to 10 Crossref results that have both a title and a DOI |
| `references[].title` | string | Paper title |
| `references[].authors` | string | Formatted author string |
| `references[].year` | string | Publication year, or `"n.d."` if unknown |
| `references[].doi` | string | DOI without the `https://doi.org/` prefix |
| `references[].citation` | string | Fully formatted citation in the requested style |

**Supported citation styles:** APA 7th, MLA 9th, Chicago 17th (notes-bibliography), Harvard (author-date)

### Example request

```bash
curl -X POST https://<your-app>/api/citations \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "content marketing",
    "style": "APA"
  }'
```

### Example response (abbreviated)

```json
{
  "topic": "content marketing",
  "style": "APA",
  "references": [
    {
      "title": "The Role of Content Marketing in Digital Brand Building",
      "authors": "Johnson, M., Patel, R.",
      "year": "2022",
      "doi": "10.1016/j.jbusres.2022.04.011",
      "citation": "Johnson, M., Patel, R. (2022). The Role of Content Marketing in Digital Brand Building. *Journal of Business Research*, *145*, 112–124. https://doi.org/10.1016/j.jbusres.2022.04.011"
    }
  ]
}
```

---

## POST /api/kdp-research

Researches Amazon/Kindle market data for a book topic. Returns KDP-optimised keywords, BISAC categories, competitive titles, pricing suggestions, and description hooks.

**Data sources:** Tavily

### Request body

```json
{
  "topic": "string",
  "book_type": "ebook | nonfiction | training_manual",
  "target_audience": "string"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | ✅ | The book topic |
| `book_type` | enum | ✅ | `ebook`, `nonfiction`, or `training_manual` |
| `target_audience` | string | ✅ | Description of the intended reader |

### Response `200`

```json
{
  "topic": "string",
  "keywords": ["string"],
  "categories": [
    { "name": "string", "bisac_code": "string" }
  ],
  "competitive_titles": [
    { "title": "string", "author": "string", "url": "string", "price_range": "string" }
  ],
  "market_insights": ["string"],
  "pricing_suggestion": {
    "ebook_price": "string",
    "print_price": "string",
    "rationale": "string"
  },
  "description_hooks": ["string"],
  "title_keywords": ["string"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `keywords` | string[] | Up to 7 KDP backend keywords |
| `categories` | object[] | BISAC categories with `name` and `bisac_code` |
| `competitive_titles` | object[] | Competing books with `title`, `author`, `url`, `price_range` |
| `market_insights` | string[] | Market positioning and competitive observations |
| `pricing_suggestion` | object | Ebook and print price with rationale |
| `description_hooks` | string[] | Opening lines for the KDP book description |
| `title_keywords` | string[] | High-value words to include in the book title |

### Example request

```bash
curl -X POST https://<your-app>/api/kdp-research \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "content marketing",
    "book_type": "ebook",
    "target_audience": "small business owners"
  }'
```

### Example response (abbreviated)

```json
{
  "topic": "content marketing",
  "keywords": ["content marketing", "content strategy", "digital marketing", "blogging for business", "SEO content", "inbound marketing", "brand content"],
  "categories": [
    { "name": "Business & Money > Marketing & Sales", "bisac_code": "BUS043000" }
  ],
  "competitive_titles": [
    { "title": "Content Marketing Revolution", "author": "Jane Smith", "url": "https://amazon.com/dp/...", "price_range": "$6.99–$9.99" }
  ],
  "market_insights": [
    "The content marketing category is saturated at the broad level but has open niches for audience-specific guides"
  ],
  "pricing_suggestion": {
    "ebook_price": "$4.99",
    "print_price": "$12.99",
    "rationale": "Priced in the $2.99–$9.99 KDP Select royalty-optimised range. $4.99 maximises the 70% royalty while undercutting established $6.99–$9.99 titles."
  },
  "description_hooks": [
    "What if your business attracted customers without spending a penny on ads?"
  ],
  "title_keywords": ["content marketing", "small business", "strategy", "guide", "beginners"]
}
```

---

## POST /api/kdp-keywords

Focused KDP keyword research for Amazon discoverability. Returns primary, long-tail, buyer-intent, and category keywords, along with subtitle suggestions and positioning guidance.

**Data sources:** Tavily (2 parallel searches: general keyword signals + Amazon-specific results)

### Request body

```json
{
  "topic": "string"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | ✅ | The book topic to research KDP keywords for |

### Response `200`

```json
{
  "topic": "string",
  "primary_keywords": ["string"],
  "long_tail_keywords": ["string"],
  "buyer_intent_keywords": ["string"],
  "category_keywords": ["string"],
  "subtitle_suggestions": ["string"],
  "recommended_categories": ["string"],
  "target_audiences": ["string"],
  "keyword_difficulty": "string",
  "discoverability_score": "string",
  "positioning_suggestions": ["string"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `primary_keywords` | string[] | Up to 8 short (1–3 word) exact-match phrases readers type into Amazon |
| `long_tail_keywords` | string[] | Up to 10 four-to-eight-word phrases with specific reader intent |
| `buyer_intent_keywords` | string[] | Up to 10 phrases from readers actively seeking to buy or learn |
| `category_keywords` | string[] | Up to 6 broader terms for KDP category browse matching |
| `subtitle_suggestions` | string[] | 6 subtitle options naturally embedding high-value keywords |
| `recommended_categories` | string[] | Up to 3 Amazon KDP browse categories |
| `target_audiences` | string[] | Up to 6 specific reader segments |
| `keyword_difficulty` | string | Narrative assessment of competition level |
| `discoverability_score` | string | Overall discoverability rating with score out of 10 and explanation |
| `positioning_suggestions` | string[] | Up to 7 KDP-specific tips for title, subtitle, and backend keywords |

### Example request

```bash
curl -X POST https://<your-app>/api/kdp-keywords \
  -H "Content-Type: application/json" \
  -d '{ "topic": "content marketing" }'
```

### Example response (abbreviated)

```json
{
  "topic": "content marketing",
  "primary_keywords": ["content marketing", "content marketing book", "content strategy guide", "content marketing for beginners"],
  "long_tail_keywords": ["content marketing for beginners step by step", "how to learn content marketing from scratch"],
  "buyer_intent_keywords": ["content marketing training", "content marketing mastery", "content marketing workbook"],
  "category_keywords": ["digital marketing", "online business", "marketing strategy", "brand building", "content creation"],
  "subtitle_suggestions": [
    "A Practical Step-by-Step Guide for Beginners",
    "The Complete Blueprint for Entrepreneurs and Professionals"
  ],
  "recommended_categories": [
    "Business & Money > Marketing & Sales",
    "Computers & Technology > Internet & Social Media > Social Media",
    "Business & Money > Entrepreneurship"
  ],
  "target_audiences": [
    "Beginners and newcomers with no prior content marketing experience",
    "Small business owners using content to grow their customer base"
  ],
  "keyword_difficulty": "High — well-established books from major publishers dominate this keyword. New titles need strong differentiation, reviews, and an author platform to compete.",
  "discoverability_score": "Challenging (4/10) — high competition means organic ranking requires sustained review velocity and a launch strategy.",
  "positioning_suggestions": [
    "Include your primary keyword in the book title — KDP weights title matches most heavily in its search algorithm",
    "Use the subtitle to add a long-tail keyword targeting lower-competition phrases"
  ]
}
```

---

## POST /api/book-market-research

Assesses the market viability of a proposed book topic. Uses Tavily web research to evaluate demand, competition, audience size, content gaps, and positioning opportunities.

**Data sources:** Tavily

### Request body

```json
{
  "topic": "string"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | ✅ | The proposed book topic to analyse |

### Response `200`

```json
{
  "market_demand": "string",
  "competition_level": "string",
  "target_audiences": ["string"],
  "popular_subtopics": ["string"],
  "content_gaps": ["string"],
  "positioning_recommendations": ["string"],
  "keyword_opportunities": ["string"],
  "monetization_potential": "string",
  "recommended_positioning": "string",
  "recommended_angles": ["string"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `market_demand` | string | Narrative assessment of reader demand and market size |
| `competition_level` | string | Assessment of competing books that already exist |
| `target_audiences` | string[] | Up to 6 specific reader segments |
| `popular_subtopics` | string[] | Subtopics frequently covered in existing books |
| `content_gaps` | string[] | Underserved angles and missing content in the market |
| `positioning_recommendations` | string[] | Strategic positioning recommendations |
| `keyword_opportunities` | string[] | High-relevance keyword phrases from research |
| `monetization_potential` | string | Assessment of revenue potential and reader spend |
| `recommended_positioning` | string | Single strategic positioning statement |
| `recommended_angles` | string[] | Up to 7 differentiated framings that could make the book stand out |

### Example request

```bash
curl -X POST https://<your-app>/api/book-market-research \
  -H "Content-Type: application/json" \
  -d '{ "topic": "content marketing" }'
```

### Example response (abbreviated)

```json
{
  "market_demand": "Moderate — steady interest from an engaged audience with consistent search volume year-round.",
  "competition_level": "High — numerous established books cover this topic directly. Standing out requires clear differentiation.",
  "target_audiences": [
    "Small business owners without a dedicated marketing budget",
    "Freelance content creators building a client base"
  ],
  "popular_subtopics": ["SEO and content", "social media strategy", "email marketing", "blogging"],
  "content_gaps": [
    "Content marketing for service businesses specifically",
    "No-budget content strategies for solopreneurs"
  ],
  "positioning_recommendations": [
    "Target a specific underserved audience (e.g. coaches, consultants, tradespeople)"
  ],
  "keyword_opportunities": ["content marketing for small business", "organic marketing strategy"],
  "monetization_potential": "Moderate — engaged audience with proven spending on learning materials.",
  "recommended_positioning": "Differentiate sharply by targeting 'Beginners with no marketing background' rather than competing with comprehensive marketing encyclopaedias.",
  "recommended_angles": [
    "Content marketing without social media",
    "Minimal-effort content systems for one-person businesses"
  ]
}
```

---

## POST /api/chapter-research

Deep research and planning data for a single book chapter. Queries Tavily (three parallel searches) and Crossref (up to 6 academic papers) and returns 15 structured planning fields. Returns research metadata only — no content is generated.

**Data sources:** Tavily (3 parallel searches: statistics/trends, cases/insights, frameworks/mistakes) + Crossref (6 papers, APA-formatted)

### Request body

```json
{
  "topic": "string",
  "chapter_title": "string",
  "target_audience": "string"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | ✅ | The overall book topic |
| `chapter_title` | string | ✅ | The title of the specific chapter to research |
| `target_audience` | string | ✅ | Description of the intended reader |

### Response `200`

```json
{
  "chapter_title": "string",
  "summary": "string",
  "learning_objectives": ["string"],
  "key_concepts": ["string"],
  "important_subtopics": ["string"],
  "industry_trends": ["string"],
  "statistics": [
    { "fact": "string", "source": "string" }
  ],
  "case_studies": [
    { "title": "string", "summary": "string" }
  ],
  "expert_insights": ["string"],
  "common_mistakes": ["string"],
  "action_steps": ["string"],
  "recommended_examples": ["string"],
  "recommended_frameworks": ["string"],
  "academic_references": ["string"],
  "sources": ["string"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `chapter_title` | string | Echo of the input chapter title |
| `summary` | string | 2–3 sentence overview of what the chapter covers |
| `learning_objectives` | string[] | 6 specific, measurable reader outcomes |
| `key_concepts` | string[] | Up to 8 core terms the chapter must define |
| `important_subtopics` | string[] | Up to 6 sub-areas the chapter should address |
| `industry_trends` | string[] | Up to 5 current trends relevant to the chapter |
| `statistics` | object[] | Up to 5 data points; `fact` (string) + `source` (domain string) |
| `case_studies` | object[] | Up to 3 real-world examples; `title` + `summary` |
| `expert_insights` | string[] | Up to 5 notable quotes or expert perspectives |
| `common_mistakes` | string[] | Up to 6 frequent errors and pitfalls |
| `action_steps` | string[] | 7 practical steps the reader can take immediately |
| `recommended_examples` | string[] | Up to 5 specific examples the author should include |
| `recommended_frameworks` | string[] | Up to 4 named frameworks or models to reference |
| `academic_references` | string[] | Up to 6 APA-formatted citation strings from Crossref |
| `sources` | string[] | Up to 8 source URLs from web research |

### Example request

```bash
curl -X POST https://<your-app>/api/chapter-research \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "content marketing",
    "chapter_title": "Building a Content Strategy",
    "target_audience": "small business owners"
  }'
```

### Example response (abbreviated)

```json
{
  "chapter_title": "Building a Content Strategy",
  "summary": "Content marketing remains vital, with 97% of marketers using it and 80% of the most successful ones using a documented strategy. This chapter equips small business owners with the concepts and tools to build a repeatable strategy without a dedicated team.",
  "learning_objectives": [
    "Define and explain the core components of a content strategy",
    "Identify the key principles that underpin building a content strategy",
    "Apply building a content strategy techniques to real-world content marketing scenarios",
    "Evaluate common approaches and understand their trade-offs",
    "Avoid the most frequent mistakes practitioners make",
    "Build a practical action plan for implementing your content strategy"
  ],
  "key_concepts": ["Content Audit", "Editorial Calendar", "Content Pillar", "Audience Persona", "Distribution Strategy", "Content ROI", "Channel Strategy", "Content Calendar"],
  "important_subtopics": ["Defining Content Goals", "Audience Persona Development", "Channel Selection", "Content Audit Process", "Editorial Calendar Setup", "Performance Metrics"],
  "industry_trends": ["AI-assisted content creation is reshaping how practitioners approach building a content strategy"],
  "statistics": [
    { "fact": "80% of successful marketers use a documented content strategy", "source": "contentmarketinginstitute.com" }
  ],
  "case_studies": [
    { "title": "How a Local Accountancy Firm Tripled Leads with Content", "summary": "By publishing weekly tax guides targeted at sole traders, a regional accountancy firm increased organic search traffic by 340% over 18 months, generating 3x the qualified leads at zero ad spend." }
  ],
  "expert_insights": [
    "The most effective practitioners of building a content strategy focus relentlessly on outcomes rather than outputs — measuring what matters instead of what is easy to count."
  ],
  "common_mistakes": [
    "Skipping the planning phase and jumping straight into execution without a clear building a content strategy strategy",
    "Trying to do too much at once — spreading effort across too many tactics instead of mastering a few"
  ],
  "action_steps": [
    "Audit your current approach — document what you are doing now and where the gaps are",
    "Define your primary goal — be specific and measurable"
  ],
  "recommended_examples": [
    "A B2B company using content strategy to generate leads — walk through their process, tools, and measurable results"
  ],
  "recommended_frameworks": [
    "The Plan-Do-Check-Act (PDCA) cycle applied to content strategy — a repeatable improvement loop",
    "A content strategy audit framework — assess current state, identify gaps, prioritise actions"
  ],
  "academic_references": [
    "Johnson, M., Lee, K. (2022). Content Strategy Effectiveness in B2B Markets. *Journal of Marketing*, *86*(3), 45–61. https://doi.org/10.1177/00222429211057013"
  ],
  "sources": [
    "https://contentmarketinginstitute.com",
    "https://ahrefs.com/blog/content-strategy"
  ]
}
```
