# Pasyal — SEO & Discoverability Guide

**v2.12 (2026-11-21).** What ships in code, and — the bigger half — what
only the owner can do on the Google / Bing / social / marketing side to
make pasyalph.com show up when people research this kind of app. Written
for one reader in a hurry: every step is a concrete action, in priority
order, with the honest time cost and what to expect.

Related: [`project-state.md`](../project-state.md) (v2.12 section,
decision D49), [`style-guide.md`](../style-guide.md) (brand).

---

## 1. What the code already does (v2.12 — nothing to do here)

Everything below is live the moment you deploy v2.12 to pasyalph.com:

| Surface | What ships |
|---|---|
| `<title>` | "Group travel planner & shared expense app · Pasyal" — carries the queries people actually type (*group travel planner*, *shared expense app*). |
| Meta description | "Plan group trips with friends and skip the spreadsheet — shared expenses, itinerary and live location in one installable web app." |
| Canonical URL | `https://pasyalph.com/` — one authoritative URL, so www/apex/vercel.app copies never compete with each other. |
| Open Graph | Title, description, `og:image` (a generated 1200×630 brand card at `/images/og-card.png`), site name — this is what Facebook, LinkedIn, WhatsApp, iMessage, Slack, Discord, Telegram render as the link preview. |
| X/Twitter card | `summary_large_image` — the same card, for X and every scraper that reads `twitter:*` first. |
| JSON-LD | `WebApplication` structured data: name, category (TravelApplication), feature list (expenses / itinerary / live location / offline PWA), free offer. This is the machine-readable summary Google and AI answer engines read. |
| `robots.txt` | Allows the landing + auth pages, blocks the crawl-wasting private shells (`/trips`, `/account`, `/settings`, `/join`) and the API. Points to the sitemap. |
| `sitemap.xml` | One URL — the landing page — with a build-date `lastmod` that refreshes on every deploy. |
| Prerendering | The landing is static HTML: crawlers and link scrapers see the full story with zero JavaScript. Lighthouse mobile already at 97/100 — Core Web Vitals are green. |
| Verification hooks | Optional `NUXT_PUBLIC_GOOGLE_SITE_VERIFICATION` / `NUXT_PUBLIC_BING_SITE_VERIFICATION` Vercel env vars emit the console-verification meta tags (fallback path — see §2). |

You can re-verify any time after a deploy:
`npm run build && node scripts/verify-seo-v212.mjs` (17 checks against
the production output).

---

## 2. Google side — do this first (≈ 30 min, the highest-leverage block)

### 2.1 Claim the site in Google Search Console (GSC)

1. Go to <https://search.google.com/search-console> and sign in with your
   Google account.
2. **Add a property → Domain → `pasyalph.com`.** The Domain type (not
   URL prefix) covers www + apex + all subdomains at once.
3. Google gives you a **TXT record** like
   `google-site-verification=xxxxxxx`. Add it in the DNS panel of
   **the registrar where you bought pasyalph.com** (Namecheap / GoDaddy /
   Cloudflare, wherever the domain lives):
   - Type `TXT`, Host `@`, Value = the string Google gave you.
4. Back in GSC, press **Verify**. DNS can take 5 min–24 h to propagate
   (usually minutes).
   - *No DNS access?* Plan B: add a **URL-prefix** property for
     `https://pasyalph.com/` and verify with the **HTML tag** method —
     copy the `content` value of their meta tag into the Vercel env var
     `NUXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, redeploy, press Verify.
     That is exactly what the v2.12 hook is for.
5. In GSC: **Sitemaps → Add a new sitemap → `sitemap.xml` → Submit.**
   It should read "Success" immediately.

### 2.2 Request indexing of the landing page

- GSC top bar → **URL Inspection → paste `https://pasyalph.com/` →
  Request Indexing**. This queues the page for crawling within days
  instead of waiting for organic discovery. Do the same for
  `/auth/signup` if you want it findable too.

### 2.3 What to expect, honestly

- "Discovered / indexed" within **a few days to ~2 weeks** for a new
  domain. Search `site:pasyalph.com` to check.
- Rankings for competitive queries (*travel expense splitter app*) take
  **weeks–months**; navigational queries (*pasyal*) usually land first.
- Check GSC monthly: **Performance** (what queries impressions come
  from) and **Pages → Indexing** (anything not indexed and why).

### 2.4 One-time hygiene on the Vercel side

- Vercel dashboard → your project → **Settings → Domains**: make sure
  `pasyalph.com` is the **primary** domain and `www.pasyalph.com` +
  `pasyal.vercel.app` show "Redirects to pasyalph.com". One canonical
  host is what the canonical tag + this redirect enforce together.
- Keep HTTPS forced (Vercel default) — never link the http:// version
  anywhere.

---

## 3. Bing + the rest of search (≈ 15 min, one-time)

Bing powers **Bing, DuckDuckGo, Yahoo and Yahoo Japan** — one import
covers all of them, and it is the #2 referral source for a new app.

1. Go to <https://www.bing.com/webmasters> and sign in (Microsoft
   account).
2. Choose **Import from Google Search Console** — sites, sitemaps and
   even some history carry over in one click. (Alternative: add the
   site manually and use the `NUXT_PUBLIC_BING_SITE_VERIFICATION` env
   var like §2.1's plan B.)
3. Submit `sitemap.xml` there too if the import missed it.
4. Optional, low priority: **IndexNow** (bing.com/indexnow) — an
   on-demand ping so Bing re-crawls instantly on deploy. Needs a key
   file; nice-to-have, not required, because the sitemap already covers
   it.

Google and Bing together are effectively "the search internet" —
there is nothing separate to do for DuckDuckGo, Yahoo, Ecosia or Brave
(Brave uses its own + Bing mix; it indexes you automatically).

---

## 4. Social surfaces — make every shared link look right (≈ 10 min)

The OG card is live; now force each platform to (re-)scrape it:

| Platform | Tool | Action |
|---|---|---|
| Facebook + Instagram + Messenger | <https://developers.facebook.com/tools/debug/> | Paste `https://pasyalph.com/` → **Scrape Again** until the preview shows the card. |
| LinkedIn | <https://www.linkedin.com/post-inspector/> | Same — paste the URL, confirm "Great!" on the OG tags. |
| X / Twitter | Card validator needs an X login these days — or just post/tweet the link once and look at the preview. | Confirm the large image card renders. |
| WhatsApp / iMessage / Slack / Discord / Telegram | No tool — paste the link in a chat. | You should see: the card image, "Pasyal — Group travel, sorted", the description. |

Do this **after** the v2.12 deploy is live. Re-scrape any time you
change the card (regenerate with
`python3 scripts/generate-og-card.py` after editing it).

---

## 5. Rich results check (≈ 5 min)

- <https://search.google.com/test/rich-results> → paste
  `https://pasyalph.com/` → the JSON-LD should parse with **0 errors**
  (the WebApplication entity).
- This is also a fast sanity check that the deployed HTML is the
  prerendered one (if the tool complains it sees no tags, the deploy
  didn't include v2.12).

---

## 6. Analytics — know what visitors do (recommended, 30 min)

You cannot improve what you cannot see. Options, best-first for this
project:

- **Plausible** (or Umami / Fathom) — privacy-friendly, cookieless, no
  consent banner needed, ~$9/mo or self-hosted. Add their script tag
  and one `connect-src`/`script-src` entry to the CSP in
  `nuxt.config.ts`.
- **Google Analytics 4** — free and deep, but cookies → consent banner
  territory.

Tell me which you pick and I'll wire it in with the CSP change in a
future task (keeping it out of this one, per focus).

---

## 7. Marketing surfaces — get pasyalph.com linked from real places

Search ranking is mostly **(a) a great page — done — and (b) links and
mentions from real websites**. In rough priority order for a
solo-founder travel app:

### Now (launch week)
1. **Product Hunt** (producthunt.com) — prepare a launch page: the OG
   card as gallery image #1, a 60-second demo GIF (screen-record the
   landing scroll + a trip with expenses), tagline = "Group travel,
   sorted." Launch on a Tuesday–Thursday. One good launch = hundreds
   of visitors + permanent backlinks from "alternatives" sites.
2. **Communities you're actually part of** — Philippine travel FB
   groups, r/PHTravel, r/SoloTravel / r/travel (respect each sub's
   self-promo rules — lead with the problem: "how do you split trip
   costs with friends?"), Discord travel/barkada servers. Genuine
   posts > link drops.
3. **Your own socials** — pin a post with the link; the OG card does
   the design work.

### This month
4. **PWA / app directories** —
   [Microsoft Store via PWABuilder](https://www.pwabuilder.com) (free:
   it packages pasyalph.com as a Store-listed app — a real "app store"
   surface and a backlink); web.dev's PWA showcase;
   alternativeto.net (list Pasyal under Splitwise/Tripcase
   alternatives — free tier).
5. **GitHub README / profile** if the repo ever goes public.
6. **Answer real questions** — Reddit/StackExchange threads asking
   "best app to split travel expenses" already exist; answer them with
   context, not spam.

### Later (compounding, only when you have time)
7. **A blog on the domain** (e.g. "How to split group travel expenses
   without a spreadsheet", "Philippines barkada trip planner") — each
   post is a page that ranks for long-tail queries and funnels to the
   landing. This is the single biggest long-term SEO lever, but it
   needs consistent writing (1–2 posts/month). Tell me when you want
   it and we'll scope a Nuxt Content section properly.
8. **Short-form video** (TikTok/Reels/Shorts) — 15-s screen captures
   of the live-location map or the settle-up animation; link in bio.
   Travel content overperforms there.

### What NOT to do (penalty risk, zero gain)
- Keyword stuffing / hidden text; buying backlinks or link farms;
  fake reviews or fake aggregateRating markup (the JSON-LD
  deliberately ships none); auto-submitting to hundreds of junk
  directories; blocking crawler JS on private pages *and* expecting
  them indexed (we made them non-indexable on purpose).

---

## 8. Checklist (print this)

- [ ] GSC Domain property verified via DNS TXT (or URL-prefix + env-var
      meta fallback)
- [ ] `sitemap.xml` submitted in GSC; `/` Request Indexing
- [ ] Bing Webmaster imported from GSC; sitemap submitted
- [ ] Facebook Sharing Debugger + LinkedIn Post Inspector re-scraped;
      link preview checked in WhatsApp/iMessage
- [ ] Rich Results test: 0 errors on `https://pasyalph.com/`
- [ ] Vercel domains: pasyalph.com primary; www + vercel.app redirect
- [ ] Optional: analytics picked and wired (ask me for the CSP change)
- [ ] Optional: PWABuilder → Microsoft Store listing
- [ ] Later: Product Hunt launch, directory/community links, blog

---

## 9. Maintenance

- **Every deploy**: nothing manual — sitemap `lastmod` re-stamps
  itself; verification metas keep working.
- **Monthly**: GSC Performance (queries, CTR), Indexing report; Bing
  dashboard.
- **On brand/copy changes**: edit `scripts/generate-og-card.py`, run it,
  re-scrape the social debuggers.
- **On domain change**: update `NUXT_PUBLIC_SITE_URL`'s default in
  `nuxt.config.ts` (single source of truth — robots.txt, sitemap.xml,
  canonical and og:url all read it), redeploy, re-verify in both
  consoles.
