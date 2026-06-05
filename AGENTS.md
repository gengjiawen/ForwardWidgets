# Repository Instructions

Use these instructions whenever working in this repository, especially when creating or editing a ForwardWidget module JS file in `widgets/`. They cover the non-obvious conventions that are easy to get wrong from intuition: fixed danmu ids, the `loadDetail` link mechanism, TMDB id format, and exact `VideoItem` field names.

# Writing ForwardWidget Modules

## Overview

A ForwardWidget module is a single JS file: one global `WidgetMetadata` object describing modules + UI params, plus the async handler functions named in it. The App calls handlers by `functionName` with a `params` object.

**Core principle:** The framework wires everything by *exact convention* — module ids, function names, and `VideoItem` field names are not free-form. Intuition gets these wrong. When unsure, copy the shape from an existing widget in `widgets/` (demo.js is the canonical reference) rather than inventing names.

**Authoritative source:** the official repo is **https://github.com/InchStudio/ForwardWidgets** — its `README.md` is the upstream developer documentation. For anything these instructions don't cover (or to confirm a field/behavior changed), check that repo's README and the widgets under `widgets/`. Use `Widget`'s own behavior in the App as the final word; these instructions distill the conventions but the repo is the source of truth.

## Quick Start

To scaffold a new module instead of writing from scratch:
```bash
node scaffold/create-widget.js --interactive   # or with --id --title --modules '[...]' --output widgets
```
`widgets/demo.js` is the living reference for every module type and the full `VideoItem` model. Read it before writing.

## Metadata Skeleton

```javascript
WidgetMetadata = {
  id: "forward.example",        // globally unique, reverse-dns style
  title: "示例",
  version: "1.0.0",
  requiredVersion: "0.0.1",     // min ForwardWidget version
  description: "...",
  author: "Forward",
  site: "https://github.com/InchStudio/ForwardWidgets",
  icon: "https://assets.vvebo.vip/scripts/icon.png",  // optional
  detailCacheDuration: 60,      // detail-page cache seconds (loadDetail)
  globalParams: [ /* OPTIONAL: params shared by EVERY module, injected into every handler's `params` */ ],
  modules: [ /* see below */ ],
  search: { /* OPTIONAL top-level search, see below */ },
};
```

`WidgetMetadata` is a bare global assignment (no `var` needed). It must be the first statement.

`globalParams` (optional, top-level array of the same param shape as module `params`) defines params shown once for the whole widget and merged into the `params` of **every** handler call — used e.g. by danmu for a `server` field. Read them off `params` like any other param.

## Module Entry

```javascript
{
  id: "loadList",               // stable id; for danmu it MUST be a fixed value (see below)
  title: "热门影片",
  functionName: "loadList",     // names a global `async function loadList(params)`
  type: "stream",               // omit for list modules; "stream"|"subtitle"|"danmu" for media handlers
  cacheDuration: 3600,          // result cache seconds
  requiresWebView: false,
  sectionMode: false,
  params: [ /* see param types */ ],
}
```

Handlers always receive ONE `params` object and return their result (usually `VideoItem[]`).

## Param Types

| type | UI | Notes |
|------|----|-------|
| `input` | text field | add `placeholders: [{title,value}]` for suggestions |
| `enumeration` | picker | requires `enumOptions: [{title,value}]` |
| `page` | pagination | App passes `params.page` |
| `count` | number | set `value` for default |
| `offset` | position | |
| `constant` | hidden constant | |
| `language` | language picker | use `value: "zh-CN"` |
| `userId` | injects device/user id | for backend rate-limit/Pro detection |

`belongTo: { paramName, value: [...] }` — show a param only when another param's value is in the list (conditional UI).

## VideoItem Model — use these EXACT field names

Intuition invents `stills`/`recommendations`/`childItems` for these — **wrong**. The real names:

```javascript
{
  id: 550,                  // tmdb numeric id. For type "url": any stable string; it may differ from `link` (routing uses `link`, not `id`).
  type: "tmdb",             // "tmdb" | "url" | "douban" | "imdb"
  mediaType: "movie",       // "movie" | "tv" — REQUIRED for tmdb items so the App resolves them
  // Normal case: numeric `id` + `mediaType` (what tmdb.js/demo.js actually do).
  // Mixed lists where one row can be either (e.g. trending all): compose id as "tv.123" / "movie.234".
  title: "Fight Club",
  posterPath: "url",        // vertical cover. For tmdb: pass the RAW path ("/abc.jpg") straight from the API — the App builds the full image URL.
  backdropPath: "url",      // horizontal cover (raw tmdb path too)
  backdropPaths: ["url"],   // ← stills/screenshots list (NOT "stills")
  relatedItems: [VideoItem],// ← recommendations (NOT "recommendations")
  episodeItems: [VideoItem],// episode list
  childItems: [VideoItem],  // nested, max ONE level deep
  trailers: [{ coverUrl: "url", url: "videoUrl" }],  // object form preferred
  genreItems: [{ id: "action", title: "动作" }],  // id REQUIRED to open category list
  peoples: [{ id, title, avatar, role }],          // id REQUIRED to open people list
  releaseDate: "2025-01-01",
  rating: 8.4,
  description: "...",
  videoUrl: "url",          // playable url
  previewUrl: "url",
  duration: 123,
  durationText: "00:00",
  link: "detail-key",       // ← opens detail page via loadDetail (see below)
  playerType: "system",     // "system" | "app"
}
```

`loadList` and `loadDetail` must share ONE `VideoItem` model — `loadDetail` may return a subset of fields, but never rename them.

## Detail Page — the `link` + `loadDetail` mechanism

This is the part everyone gets wrong. There is **no `detailFunctionName`**. The flow:

1. **`link` is only for your own `type: "url"` items.** Set `type: "url"` + `link: "<your-key>"` on the list item. `tmdb`/`douban`/`imdb` items do **not** carry `link` — the App opens their built-in detail page from the id, and `loadDetail` is never called for them.
2. Tapping a `type:"url"` item calls the **top-level** `loadDetail(link)` function — it is NOT a module, has no `params` object, and receives the `link` **string** directly.
3. The `link` string is yours to design — there is no required relation to `id`. Encode whatever you need to fetch the detail (commonly the id) and parse it back. Route by it; don't hardcode a single key.
4. `loadDetail` returns a `VideoItem` (or `VideoItem[]`) enriching the item: `backdropPaths`, `trailers`, `genreItems`, `peoples`, `relatedItems`, `videoUrl`, etc. Return `null` for an unknown link.

```javascript
async function loadDetail(link) {
  // link e.g. "detail:movie-1" — parse, fetch, return enriched VideoItem
  const key = String(link).split(":")[1];
  const data = await fetchDetail(key);           // your own lookup
  if (!data) return null;
  return {
    id: link, type: "url", title: data.title, link,
    backdropPaths: data.stills,                  // stills list
    relatedItems: data.recs,                     // recommendations
    genreItems: data.genres.map((g) => ({ id: String(g.id), title: g.name })),
  };
}
```

When the user taps a category or person on the detail page, the App reopens the owning **list module** with `params.genreId` / `params.peopleId` set to the **string value you put in `genreItems[].id` / `peoples[].id`** (compare with `String(...)`). Filter the list on it. This only works if those items carried an `id`.

## Search — top-level `search`, not a module

Do NOT add a `type:"search"` module. Declare a sibling `search` block on `WidgetMetadata`:

```javascript
search: {
  title: "搜索",
  functionName: "search",   // global async function search(params), returns VideoItem[]
  params: [
    { name: "keyword", title: "关键词", type: "input" },   // user query → params.keyword
    { name: "page", title: "页码", type: "page" },         // declare page here to get paginated search
  ],
}
```

The query arrives as `params.keyword`. To paginate search results you MUST declare a `page` param here — otherwise the App never sends `params.page` and your in-code paging is dead.

## Danmu — three fixed-id modules, `type: "danmu"`

Danmu is a **three-stage chain**. Each stage is its own module with a **fixed `id` the App matches on** (you can't rename the `id`; `functionName` is yours). All have `type: "danmu"` and `params: []` — inputs are auto-injected.

| stage | fixed `id` | functionName (yours) | gets (in `params`) | returns |
|------|-----------|---------------------|--------------------|---------|
| 1 search | `searchDanmu` | `searchDanmu` | `title, seriesName, season, type, tmdbId` | `{ animes: [{ animeId, animeTitle, type }] }` |
| 2 episodes | `getDetail` | `getDetailById` | `animeId` (the one you returned) `, seriesName, season, episode` | `[{ episodeId, episodeTitle }]` (a bare array) |
| 3 comments | `getComments` | `getCommentsById` | `commentId` (= the `episodeId` the user picked) | server-native `{ count, comments: [...] }` |

Plus the optional `getDanmuWithSegmentTime` module (also `type:"danmu"`, gets `segmentTime`) for time-segmented loading — see `widgets/segmentDanmuExample.js`.

**Data flow (this is the whole trick):** stage 1 returns `animes[].animeId` → user picks an anime → App calls stage 2 with that `animeId` → you return `episodes[].episodeId` → user picks an episode → App calls stage 3 with that `episodeId` **as `params.commentId`**. So whatever id you emit in one stage is the id the next stage receives.

Reference impl is `widgets/danmu.js` (dandanplay/Misaka, multi-source). Minimal dandanplay shape:

```javascript
const SERVER = "https://api.dandanplay.net";   // overridable via globalParams `server`
async function searchDanmu(params = {}) {
  const kw = params.seriesName || params.title;
  const res = await Widget.http.get(`${params.server || SERVER}/api/v2/search/anime?keyword=${encodeURIComponent(kw)}`);
  return { animes: (res.data.animes || []).map((a) => ({ animeId: a.bangumiId || a.animeId, animeTitle: a.animeTitle, type: a.type })) };
}
async function getDetailById(params = {}) {
  const res = await Widget.http.get(`${params.server || SERVER}/api/v2/bangumi/${params.animeId}`);
  const eps = (res.data.bangumi && res.data.bangumi.episodes) || [];
  return eps.map((e) => ({ episodeId: e.episodeId, episodeTitle: e.episodeTitle }));   // bare array
}
async function getCommentsById(params = {}) {
  const res = await Widget.http.get(`${params.server || SERVER}/api/v2/comment/${params.commentId}?withRelated=true&chConvert=1`);
  return res.data;   // { count, comments: [...] } — built-in parser handles dandanplay JSON/XML
}
```

**Comment format:** returning the server's native dandanplay `{ count, comments: [{ cid, p, m }] }` works out of the box (built-in JSON/XML + zlib support). To emit your own, follow one of the two accepted shapes (`{p,m,cid}` objects, or `[time,pos,color,"",text]` arrays).

**Known trap (Misaka/bangumi):** prefer `bangumiId` over `animeId` (shown above) — `animeId` picks the wrong season on multi-season shows. Match stage 2 with the original `seriesName`, not the App-overwritten `title`. (Project memory `danmu_misaka.md` / `danmu_concurrency.md`.)

## Runtime APIs

```javascript
const res = await Widget.http.get(url, { headers: {...}, params: {...}, allow_redirects: false });
const res = await Widget.http.post(url, body, { headers: {...} });
const data = res.data;                       // ← http.* wraps the body in `.data`

// TMDB convenience: auto key/host. `api` is a path WITHOUT a leading slash ("movie/now_playing", `trending/all/${w}`).
const res = await Widget.tmdb.get(api, { params });
const list = res.results;                    // ⚠️ tmdb.get returns the TMDB body DIRECTLY — `res.results`, NOT `res.data.results`

const $ = Widget.html.load(htmlContent);     // cheerio handle for scraping

Widget.storage.get(key); Widget.storage.set(key, value);   // persistent cache
```

Do **not** assume `fetch`, `URLSearchParams`, or Node APIs exist — use `Widget.http` and pass query via the `params` option.

## Handler Pattern

```javascript
async function loadList(params = {}) {
  try {
    const page = Number(params.page || 1);
    const res = await Widget.tmdb.get("movie/popular", { params: { page, language: params.language || "zh-CN" } });
    if (!res || !res.results) throw new Error("空响应");
    return res.results.map((m) => ({
      id: m.id, type: "tmdb", mediaType: "movie",   // numeric id + mediaType (see VideoItem notes)
      title: m.title, posterPath: m.poster_path, rating: m.vote_average,
    }));
  } catch (error) {
    console.error("[loadList] 失败:", error.message || error);
    throw error;          // surface to App; log for the in-app module tester
  }
}
```

## Backtesting Locally (本地回测)

There is no test runner / `package.json`. The App runs modules inside a JS bridge that injects the `Widget` global; locally you reproduce that with a Node script that **mocks `Widget`, `eval`s the module file, then calls handlers directly**. This is the established pattern — see `test-new-flow.js`, `test-danmu-multi-source.js`, `widgets/test-danmu.js`.

Two mock styles:
- **Live** — proxy `Widget.http` to real `fetch` (returns `{ data, status, headers }`). Verifies the real endpoint end-to-end. Pattern: `test-new-flow.js`.
- **Offline / assertion** — return hardcoded responses keyed by URL, use `assert/strict`, and track the `calls[]` array / `maxInFlight` to assert request shape, ordering, or concurrency. No network, deterministic, CI-safe. Pattern: `test-danmu-multi-source.js`.

```javascript
// test-mywidget.js  — run with:  node test-mywidget.js
const fs = require("fs");
const assert = require("assert/strict");

const calls = [];
global.Widget = {
  http: {                                          // http.* WRAPS the body in `.data`
    get: async (url) => {
      calls.push(url);
      if (url.includes("/search/anime")) return { data: { animes: [{ animeId: 42, animeTitle: "X", type: "tv" }] } };
      if (url.includes("/bangumi/"))     return { data: { bangumi: { episodes: [{ episodeId: 4201, episodeTitle: "第1集" }] } } };
      if (url.includes("/comment/"))     return { data: { count: 1, comments: [{ cid: 1, p: "1.0,1,16777215", m: "hi" }] } };
      // … live: return { data: await (await fetch(url)).json() };
      throw new Error("unmocked url: " + url);
    },
    post: async (url) => { calls.push(url); return { data: {} }; },
  },
  tmdb: {                                          // tmdb.get returns the TMDB body DIRECTLY (no `.data`)
    get: async (api) => {
      calls.push("tmdb:" + api);
      if (api.includes("movie/popular")) return { results: [{ id: 550, title: "Fight Club", poster_path: "/x.jpg" }] };
      throw new Error("unmocked tmdb: " + api);
    },
  },
  storage: { _m: {}, get(k){return this._m[k];}, set(k,v){this._m[k]=v;} },
  html: { load: (h) => { /* stub, or require('cheerio').load(h) for live scraping */ } },
};
global.WidgetMetadata = {};   // placeholder; eval needs the global to exist

eval(fs.readFileSync("./widgets/mywidget.js", "utf8"));   // loads loadList/loadDetail/searchDanmu/... into scope

(async () => {
  const list = await loadList({ page: 1, language: "zh-CN" });
  assert.equal(list[0].id, 550);                   // numeric id (NOT "movie.550" here)
  assert.equal(list[0].type, "tmdb");
  assert.equal(list[0].mediaType, "movie");

  const detail = await loadDetail("detail:movie-1");        // loadDetail takes the link STRING
  assert.ok(Array.isArray(detail.backdropPaths));          // stills under the real field name
  assert.equal(detail.stills, undefined);                  // NOT "stills"

  const { animes } = await searchDanmu({ seriesName: "X", season: 1, type: "tv" });
  const eps = await getDetailById({ animeId: animes[0].animeId });          // stage2: array
  const cmt = await getCommentsById({ commentId: eps[0].episodeId });       // stage3: episodeId→commentId
  assert.ok(cmt.comments.length > 0);

  console.log("✅ ok", { calls });
})().catch((e) => { console.error("❌", e); process.exit(1); });
```

Put the test script at the **repo root** (where `node_modules` resolves, so a live test's `require('cheerio')` works); offline tests need no deps. Run with `node test-mywidget.js`.

Checklist before saying a module works: list returns `VideoItem[]` with correct field names; `loadDetail(link)` enriches via `backdropPaths`/`relatedItems`; the danmu chain `searchDanmu → getDetailById → getCommentsById` threads its ids correctly and returns comments; `search` returns results. Assert these, don't eyeball.

### Tests that actually catch bugs

A test that only checks the happy-path return value passes even when the module is broken in a way that happens not to crash. Make the catching deliberate:

- **Assert the request you SENT, not just the value you got back.** For id-threading bugs (the danmu chain, detail routing), record `calls[]` in the mock and assert the upstream id appears in the next stage's URL — e.g. `assert.ok(calls.some((u) => u.includes("/comment/" + episodeId)))`. A return-only assert misses a wrong-id request that still returns *something*.
- **Pair positive + negative asserts for every renamed-field trap.** For each row in Common Mistakes, assert the real name is present AND the wrong name is absent: `assert.ok(Array.isArray(d.backdropPaths)); assert.equal(d.stills, undefined);`. Also assert raw API keys don't leak (`assert.equal(item.poster_path, undefined)`).
- **Make mocks return *plausible-wrong* data, not `undefined`.** If a mock returns `undefined` the module throws and the test goes red by accident — you've tested nothing. Return a well-formed-but-incorrect body so it's your *assertion* that fails, proving the assertion has teeth.
- **Self-check by mutation: flip one thing, confirm red.** Before trusting a test, temporarily break one field name or one threaded id in the module and rerun — if the test still passes, the test is too weak. Revert once confirmed.
- Parameterize the target (`fs.readFileSync(process.argv[2] || "./widgets/x.js")`) so you can point the same test at a mutated copy.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Inventing a `type:"search"` module | Use the top-level `search` block |
| Danmu as 1–2 modules / renamed ids / object functionName | Three modules, fixed ids `searchDanmu`→`getDetail`→`getComments`, each `type:"danmu"`; thread `animeId`→`episodeId`(→`commentId`) |
| `res.data.results` on a `Widget.tmdb.get` call | `tmdb.get` returns the body directly → `res.results`. Only `Widget.http.*` wraps in `.data` |
| Leading slash in tmdb api path | `Widget.tmdb.get("movie/popular", ...)` — no leading slash |
| `stills`/`recommendations`/`detailFunctionName` | Real names: `backdropPaths`, `relatedItems`; detail via `link` + top-level `loadDetail(link)` |
| `loadDetail(params)` | It takes the `link` **string**, not a params object |
| Putting `link` on a tmdb/douban/imdb item | `link`+`loadDetail` is only for your own `type:"url"` items; id-based items use the built-in detail page |
| Composing `"movie.123"` everywhere | Normal: numeric `id` + `mediaType`. Only mixed lists need `"tv.123"`/`"movie.234"` |
| `genreItems`/`peoples` without `id` | Detail page can't open their lists — always include `id`; `params.genreId` equals that id (string compare) |
| Using `fetch`/`URLSearchParams` | Use `Widget.http` with the `params` option |
| New `var WidgetMetadata` mid-file | Single bare `WidgetMetadata = {...}` assignment, first statement |

## Encrypt (optional)

Encryption is optional and the App auto-decrypts; an unencrypted module also works. To encrypt a module file, use the `/fw-encrypt widgets/<file>.js` command.
