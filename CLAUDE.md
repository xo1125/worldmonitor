# FCMonitor Development Notes

## 🤖 Model Preferences (Jan 30, 2026)

**For ALL coding tasks in FCMonitor, ALWAYS use:**

| Task | Model | Alias |
|------|-------|-------|
| **Coding** | `openrouter/anthropic/claude-sonnet-4-5` | `sonnet` |
| **Coding** | `openai/gpt-5-2` | `codex` |

**Never default to MiniMax for coding tasks.**

**How to run with preferred model:**
```bash
# Sonnet for coding
clawdbot --model openrouter/anthropic/claude-sonnet-4-5 "build me..."

# Codex for coding  
clawdbot --model openai/gpt-5-2 "build me..."
```

**Set as default:**
```bash
export CLAUDE_MODEL=openrouter/anthropic/claude-sonnet-4-5
```

## CRITICAL: Git Branch Rules

**NEVER merge or push to a different branch without explicit user permission.**

- If on `beta`, only push to `beta` - never merge to `main` without asking
- If on `main`, stay on `main` - never switch branches and push without asking
- NEVER merge branches without explicit request
- Pushing to the CURRENT branch after commits is OK when continuing work

## Critical: RSS Proxy Allowlist

When adding new RSS feeds in `src/config/feeds.ts`, you **MUST** also add the feed domains to the allowlist in `api/rss-proxy.js`.

### Why
The RSS proxy has a security allowlist (`ALLOWED_DOMAINS`) that blocks requests to domains not explicitly listed. Feeds from unlisted domains will return HTTP 403 "Domain not allowed" errors.

### How to Add New Feeds

1. Add the feed to `src/config/feeds.ts`
2. Extract the domain from the feed URL (e.g., `https://www.ycombinator.com/blog/rss/` → `www.ycombinator.com`)
3. Add the domain to `ALLOWED_DOMAINS` array in `api/rss-proxy.js`
4. Deploy changes to Vercel

### Example
```javascript
// In api/rss-proxy.js
const ALLOWED_DOMAINS = [
  // ... existing domains
  'www.ycombinator.com',  // Add new domain here
];
```

### Debugging Feed Issues
If a panel shows "No news available":
1. Open browser DevTools → Console
2. Look for `HTTP 403` or "Domain not allowed" errors
3. Check if the domain is in `api/rss-proxy.js` allowlist

## Routes

| URL | Shell | View |
|-----|-------|------|
| `/` | `index.html` → `src/main.ts` | Macro dashboard |
| `/watch` | `watch.html` → `src/watch.ts` | Robinhood Chain watchlist |
| `/watch/<symbol>` | same shell | One token's page (e.g. `/watch/pons`) |

Both shells mount the same `App`, which picks the view from `window.location.pathname`.
`watch.html` has its own title, description, canonical URL and JSON-LD so the link
previews correctly when shared — `htmlVariantPlugin` skips it for that reason.

`vercel.json` rewrites `/watch` → `/watch.html`; `watchRoutePlugin` does the same in
dev. The tab bar navigates with `pushState` between the two paths and handles
back/forward. **The URL is the only source of truth for which view is shown** — a
remembered tab would otherwise render the watchlist inside the macro page's markup.
The legacy `?tab=robinhood` form still works and rewrites itself to `/watch`.

Each tab loads its data only when first shown, so `/watch` never pays for the macro
tab's feeds and market calls (and vice versa).

## Robinhood Chain Tab

The dashboard has two tabs: **MACRO** (the original panel set) and **ROBINHOOD**
(the Robinhood Chain token watchlist). The tab bar sits between the header and
the panel grid; each tab has its own grid (`#panelsGrid`, `#rhGrid`) and only one
is visible at a time.

### Files

| File | Role |
|------|------|
| `api/_lib/rh-tokens.js` | Token registry — the single source of truth. Addresses, X handles, DefiLlama slugs, and which metric matters per project |
| `api/_lib/rh-sources.js` | DexScreener / DefiLlama / RPC fetchers |
| `api/_lib/rh-aggregate.js` | Builds the payload; merges partial failures from the previous one |
| `api/_lib/rh-store.js` | Redis: snapshot history + X follower cache |
| `api/robinhood-watchlist.js` | The endpoint the client polls (every 2 min, only while the tab is open) |
| `api/robinhood-snapshot.js` | Cron: writes a history row every 30 min |
| `api/robinhood-x.js` | Apify-backed X follower counts |
| `src/services/robinhood.ts` | Types + formatters |
| `api/robinhood-detail.js` | Per-token drill-down: fee/revenue history, valuation multiples, CoinGecko attention |
| `src/components/RH*Panel.ts` | The three list panels: chain vitals, watchlist, revenue |
| `src/components/RHTokenPage.ts` | Per-token page at `/watch/<symbol>` |

**The list ranks; the token page explains.** Nothing appears in both. Movers,
On-Chain and Attention panels were deleted because every figure they held already
existed in the watchlist or belongs on a token page — turnover was the one signal
only they carried, so it became a watchlist column.

### Adding a token

Add an entry to `RH_TOKENS` in `api/_lib/rh-tokens.js`. The address must be the
token contract on Robinhood Chain — verify it resolves on DexScreener first:

```bash
curl "https://api.dexscreener.com/latest/dex/tokens/<address>" | jq '.pairs[0].chainId'
```

`metricSource` decides where the primary metric comes from: `defillama:<slug>`,
`onchain:burn`, `derived:backing`, `derived:utilisation`, `dex:liquidity`,
`dex:volume`, `social`, or `none`. Anything unavailable renders as `—` with the
reason in the cell tooltip — do not substitute a proxy number silently.

### Data sources and their limits

- **DexScreener** (no key, 300 req/min) — price, mcap, liquidity, volume, txns.
  Queried **one address per request**: the endpoint caps responses at 30 pairs and
  batching silently drops pairs, which understates aggregate liquidity.
- **DefiLlama** (no key) — chain TVL/fees/DEX volume, and per-protocol TVL, staking,
  borrowed, fees and revenue. Reserve protocols book their treasury under `staking`,
  not `tvl` (NetNet reports 0 TVL, ~$57M staking), so read both.
- **Public RPC** `rpc.mainnet.chain.robinhood.com` (chainId 4663) — supply, burns,
  treasury balances. Batched `eth_call`, max ~24 calls per batch or the node 429s;
  `robinhood-rpc.publicnode.com` is the fallback.
- **Blockscout** (`robinhoodchain.blockscout.com`) is behind Cloudflare and cannot be
  called server-side. **Holder counts have no free source** — do not add a panel that
  claims to show them without solving this first (indexing `Transfer` logs over RPC
  is the only real option).
- **X followers** come from Apify; there is no free X API. CoinGecko dropped
  `twitter_followers`, so it is not a substitute — but its `watchlist_portfolio_users`
  and sentiment votes are live and free, and the detail modal shows them. Those are
  fetched one token at a time on open, because the free tier cannot take 22 calls
  per refresh.

**Annualisation uses 30d × 12.17, never DefiLlama's `annualized1y`.** These protocols
are weeks old, so a trailing-year figure understates them by an order of magnitude.

### Environment variables

```bash
APIFY_TOKEN=apify_api_xxx          # required for X follower counts
APIFY_X_ACTOR=apidojo~twitter-user-scraper   # optional, override the actor
APIFY_X_INPUT_KEY=twitterHandles             # optional, actor's handle-list field
CRON_SECRET=xxx                    # optional, guards the cron endpoints
UPSTASH_REDIS_REST_URL=...         # already set for AI Insights; reused for history
UPSTASH_REDIS_REST_TOKEN=...
```

Without Redis the tab still renders — it just has no deltas or sparklines, since
every upstream reports levels rather than growth.

### Apify cost and demo mode

`apidojo/twitter-user-scraper` is **pay-per-event**, not free: $0.004 per profile
lookup plus $0.0004 per dataset item. One run over the 17 handles costs roughly
$0.07, so a daily cron is about $2/month and a twice-daily one about $4.20 —
against the $5/month credit a free Apify account gets. The X cron is set to run
once daily for that reason.

**Demo mode:** when the account cannot be charged (free plan, trial exhausted),
the actor still reports `SUCCEEDED` but writes `{"demo": true}` rows instead of
profiles. `runApifyBatch` detects this and fails with a message naming the cause —
do not treat it as a parser bug. Fixing it means adding a payment method or plan
on Apify, or pointing `APIFY_X_ACTOR` at another actor.

The actor also **silently truncates large batches** (17 handles returned 10),
which is why handles are requested in chunks of 8, two runs at a time.

### Scheduling

Scheduling lives in `.github/workflows/robinhood-cron.yml`, **not** `vercel.json`.
Vercel's Hobby plan caps crons at one run per day and *rejects the deployment* if a
schedule exceeds it — that failure looks like a generic build error and only the
status link reveals the cause. Snapshots need finer resolution than daily to be
worth anything, so GitHub Actions drives them every 30 minutes instead.

`/api/robinhood-x?refresh=1` bills Apify per profile, so in production it refuses
to run unless `CRON_SECRET` is set, and the workflow's follower job is skipped
without it. `/api/robinhood-snapshot` is idempotent and stays open.

## Running Locally
```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run typecheck  # Type checking only
```

## AI Summarization & Caching

The AI Insights panel uses a server-side Redis cache to deduplicate API calls across users.

### Required Environment Variables

```bash
# Groq API (primary summarization)
GROQ_API_KEY=gsk_xxx

# OpenRouter API (fallback)
OPENROUTER_API_KEY=sk-or-xxx

# Upstash Redis (cross-user caching)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

### How It Works

1. User visits → `/api/groq-summarize` receives headlines
2. Server hashes headlines → checks Redis cache
3. **Cache hit** → return immediately (no API call)
4. **Cache miss** → call Groq API → store in Redis (24h TTL) → return

### Model Selection

- **llama-3.1-8b-instant**: 14,400 req/day (used for summaries)
- **llama-3.3-70b-versatile**: 1,000 req/day (quality but limited)

### Fallback Chain

1. Groq (fast, 14.4K/day) → Redis cache
2. OpenRouter (50/day) → Redis cache
3. Browser T5 (unlimited, slower, no cache)

### Setup Upstash

1. Create free account at [upstash.com](https://upstash.com)
2. Create a new Redis database
3. Copy REST URL and Token to Vercel env vars

## Service Status Panel

Status page URLs in `api/service-status.js` must match the actual status page endpoint. Common formats:
- Statuspage.io: `https://status.example.com/api/v2/status.json`
- Atlassian: `https://example.status.atlassian.com/api/v2/status.json`
- incident.io: Same endpoint but returns HTML, handled by `incidentio` parser

Current known URLs:
- Anthropic: `https://status.claude.com/api/v2/status.json`
- Zoom: `https://www.zoomstatus.com/api/v2/status.json`
- Notion: `https://www.notion-status.com/api/v2/status.json`

## Allowed Bash Commands

The following additional bash commands are permitted without user approval:
- `Bash(ps aux:*)` - List running processes
- `Bash(grep:*)` - Search text patterns
- `Bash(ls:*)` - List directory contents

## Bash Guidelines

### IMPORTANT: Avoid commands that cause output buffering issues
- DO NOT pipe output through `head`, `tail`, `less`, or `more` when monitoring or checking command output
- DO NOT use `| head -n X` or `| tail -n X` to truncate output - these cause buffering problems
- Instead, let commands complete fully, or use `--max-lines` flags if the command supports them
- For log monitoring, prefer reading files directly rather than piping through filters

### When checking command output:
- Run commands directly without pipes when possible
- If you need to limit output, use command-specific flags (e.g., `git log -n 10` instead of `git log | head -10`)
- Avoid chained pipes that can cause output to buffer indefinitely
