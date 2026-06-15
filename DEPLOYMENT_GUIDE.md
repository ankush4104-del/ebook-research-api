# Deployment Guide

This guide covers deploying the API to **Render** (recommended for production) and **Replit Deploy**, and connecting the deployed API to a Custom GPT as a GPT Action.

---

## A. Render Deployment

Render is a cloud platform that can host this API as a persistent web service. It is suitable for production use with the Custom GPT.

### A.1 Prerequisites

- A GitHub account
- The project pushed to a GitHub repository
- A Render account (free tier works; [render.com](https://render.com))
- Your `TAVILY_API_KEY` from [app.tavily.com](https://app.tavily.com)

### A.2 Push the project to GitHub

If not already done:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### A.3 Create a Render account

1. Go to [render.com](https://render.com) and sign up
2. Connect your GitHub account via **Settings → Account → Connect GitHub**

### A.4 Create a Web Service

1. Click **New +** → **Web Service**
2. Select your GitHub repository
3. Configure the service:

| Setting | Value |
|---------|-------|
| **Name** | `ebook-research-api` (or any name) |
| **Region** | Choose closest to your users |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `pnpm install && pnpm --filter @workspace/api-server run build` |
| **Start Command** | `node --enable-source-maps artifacts/api-server/dist/index.mjs` |
| **Instance Type** | Free (for testing) or Starter (for production) |

> **Note:** Render's free tier spins down after 15 minutes of inactivity. The first request after a cold start may take 30–60 seconds. Use **Starter** or higher for a Custom GPT in active use.

### A.5 Set environment variables

In the Render service dashboard → **Environment**:

| Key | Value | Required |
|-----|-------|----------|
| `TAVILY_API_KEY` | Your Tavily API key | ✅ Yes |
| `NODE_ENV` | `production` | ✅ Yes |
| `SESSION_SECRET` | Any secure random string | Optional |

**Do not set `PORT`** — Render injects it automatically. The server reads `process.env.PORT` and will throw on startup if it is missing or invalid.

### A.6 Health check

In the Render service dashboard → **Settings → Health Check Path**:

```
/api/healthz
```

Render will call this endpoint after each deploy. The service is marked healthy only when it returns HTTP 200. A successful response is:
```json
{ "status": "ok" }
```

### A.7 Deploy

Click **Create Web Service**. Render will:
1. Clone the repository
2. Run the build command
3. Start the server
4. Poll the health check endpoint
5. Mark the deployment as live when healthy

### A.8 Your production URL

After deployment, your production base URL will be:

```
https://<your-service-name>.onrender.com/api
```

Example endpoints:
```
GET  https://ebook-research-api.onrender.com/api/healthz
POST https://ebook-research-api.onrender.com/api/research
POST https://ebook-research-api.onrender.com/api/outline
POST https://ebook-research-api.onrender.com/api/chapter-research
POST https://ebook-research-api.onrender.com/api/citations
POST https://ebook-research-api.onrender.com/api/kdp-research
POST https://ebook-research-api.onrender.com/api/kdp-keywords
POST https://ebook-research-api.onrender.com/api/book-market-research
```

### A.9 Verify the deployment

```bash
curl https://<your-service-name>.onrender.com/api/healthz
# → {"status":"ok"}

curl -X POST https://<your-service-name>.onrender.com/api/research \
  -H "Content-Type: application/json" \
  -d '{"topic":"productivity","book_type":"ebook","target_audience":"remote workers"}'
```

### A.10 Auto-deploy on push

By default, Render redeploys automatically when you push to the connected branch. To disable this, go to **Settings → Build & Deploy → Auto-Deploy** and set it to **No**.

---

## B. Replit Deploy (Alternative)

Replit's built-in deployment is the simplest option if the project lives in Replit.

### B.1 Set required secrets

In Replit → **Secrets** (lock icon in sidebar):

| Key | Value |
|-----|-------|
| `TAVILY_API_KEY` | Your Tavily API key |
| `SESSION_SECRET` | Any secure random string |

### B.2 Deploy

1. Click **Deploy** in the Replit top bar
2. Select **Autoscale** (cost-effective; scales to zero when idle) or **Reserved VM** (always on; no cold starts)
3. Click **Deploy** — Replit runs the build and health check automatically

The deployment configuration is already defined in `artifacts/api-server/.replit-artifact/artifact.toml`:
- **Build:** `pnpm --filter @workspace/api-server run build`
- **Start:** `node --enable-source-maps artifacts/api-server/dist/index.mjs`
- **Health check:** `GET /api/healthz`

### B.3 Production URL

```
https://<your-repl-name>.replit.app/api
```

---

## C. GPT Actions Setup

### C.1 OpenAPI file location

The spec file used for GPT Actions import is:

```
lib/api-spec/openapi.yaml
```

This is the single source of truth for all endpoint contracts.

### C.2 Update servers.url

GPT Actions require an **absolute HTTPS URL** in the spec. The development default is a relative path — it must be updated before importing.

Open `lib/api-spec/openapi.yaml` and change lines 7–9:

**Before:**
```yaml
servers:
  - url: /api
    description: Base API path
```

**After (Render):**
```yaml
servers:
  - url: https://<your-service-name>.onrender.com/api
    description: Production API
```

**After (Replit Deploy):**
```yaml
servers:
  - url: https://<your-repl-name>.replit.app/api
    description: Production API
```

> **Important:** Do not change `info.title` — it must remain `Api`. Changing it breaks generated TypeScript import paths in `lib/api-zod` and `lib/api-client-react`.

After updating the spec, run codegen if you will also regenerate the Zod schemas:
```bash
pnpm --filter @workspace/api-spec run codegen
```

### C.3 Importing the schema into a Custom GPT

1. Go to [chat.openai.com](https://chat.openai.com)
2. Click your profile → **My GPTs** → **Create a GPT** (or open an existing one)
3. Go to the **Configure** tab
4. Scroll to **Actions** and click **Create new action**
5. In the **Schema** field, paste the full contents of `lib/api-spec/openapi.yaml`
6. OpenAI will parse and validate the schema automatically

After importing, the GPT Actions editor will list all 8 endpoints:

| Method | Path | Operation |
|--------|------|-----------|
| GET | `/healthz` | Health check |
| POST | `/research` | Research a topic for book creation |
| POST | `/outline` | Generate a research-based book outline |
| POST | `/citations` | Generate formatted academic citations |
| POST | `/kdp-research` | Research KDP publishing metadata |
| POST | `/kdp-keywords` | Research Amazon KDP keyword opportunities |
| POST | `/book-market-research` | Analyse a book topic's market viability |
| POST | `/chapter-research` | Deep research for a specific book chapter |

### C.4 Authentication settings

The API currently has **no authentication layer**. Set the following in the GPT Actions editor:

- **Authentication:** None

Any caller with the URL can access the API. If you add API key middleware to the server later, switch this to **API Key** and enter the key.

### C.5 Testing GPT Actions

**From the GPT Actions editor:**
1. Click **Test** next to any endpoint
2. Fill in the required fields
3. Click **Run** — the raw JSON response is shown

**Health check test:**
- Method: `GET /healthz`
- Expected: `{ "status": "ok" }`

**Research test:**
```json
{
  "topic": "productivity",
  "book_type": "ebook",
  "target_audience": "remote workers"
}
```

**From the GPT chat interface:**
After saving the GPT, open it and instruct it:
> "Research the topic 'productivity' for an ebook aimed at remote workers."

The GPT should automatically call `/research` and return structured findings.

### C.6 Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| GPT Action shows `fetch error` | `servers.url` is still the relative `/api` value | Update to the absolute production URL and re-import the schema |
| All Tavily endpoints return 500 | `TAVILY_API_KEY` is missing or wrong | Check environment variables; redeploy after fixing |
| 400 Bad Request | Missing a required request field | Check the request schema — all required fields must be present |
| Schema import fails | YAML is invalid | Validate the YAML at [yaml.org/start.html](https://yaml.org/start.html) or [yamlchecker.com](https://yamlchecker.com) |
| Cold start delays | Free tier Render/Replit spinning up from zero | Upgrade to a paid tier, or send a warmup request to `/api/healthz` before the first data call |
| Endpoint not listed after import | `operationId` missing or duplicate | Check `lib/api-spec/openapi.yaml` — all paths must have a unique `operationId` |
| GPT sends wrong field names | Schema was imported before the `servers.url` update | Re-import the updated YAML after changing the server URL |

---

## D. Environment Variables Reference

### Required for all deployments

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `TAVILY_API_KEY` | Tavily Search API key | [app.tavily.com](https://app.tavily.com) → Dashboard → API Keys |

### Auto-injected by the platform

| Variable | Description |
|----------|-------------|
| `PORT` | Server port. Injected by Replit (8080) and Render automatically. **Never set this manually.** |

### Optional

| Variable | Description |
|----------|-------------|
| `SESSION_SECRET` | Reserved for future authentication middleware. Any secure random string. Not used by any route currently. |
| `DATABASE_URL` | PostgreSQL connection string. Only required if the `lib/db` (Drizzle ORM) layer is activated. Not needed for the current feature set. |

### Generating a secure SESSION_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## E. Build and Run Reference

```bash
# Install all workspace dependencies
pnpm install

# Build the API server (production bundle via esbuild)
pnpm --filter @workspace/api-server run build
# Output: artifacts/api-server/dist/index.mjs

# Start the built server (requires PORT env var)
PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs

# Full TypeScript typecheck (all packages)
pnpm run typecheck

# Regenerate Zod schemas + React Query hooks from the OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push Drizzle DB schema (only if lib/db is activated)
pnpm --filter @workspace/db run push
```
