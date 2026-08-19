# Engagements Authoring Primer — Sarif Consulting

**Purpose:** a self-contained context pack for authoring, rewriting, replacing, or
adding engagement dossiers in a fresh chat thread. Paste this whole file as the
primer. It contains the complete data contract, the exhibition-hall design
language, the imagery and linking rules, and the exact commands that verify the
work.

**Repo:** `nprimm1992-ui/sarifWS` · **Content root:** `src/content/engagements/`
**Last verified against:** build of 21 pages, 8 postbuild sentinels green, 0 type errors.

---

## 0. What you are authoring

Engagements are the firm's **proof surface** — the "what we have done" archive.
They are presented as an **exhibition hall**: each engagement is a *specimen*
with a museum *plaque*, a *specimen plate* (optional hero image), a *mandate*,
an *operations log*, and a *walk* to the neighbouring exhibits.

Two surfaces render every entry:

| Surface | Path | Renders |
|---|---|---|
| **Hall index** | `/engagements/` | Carousel of cards + "Exhibition index" directory chips |
| **Dossier** | `/engagements/<id>/` | Full exhibit: locator, telemetry, plaque, plate, mandate, log, walk |

One file drives both. There is no separate card copy.

### Current hall (6 exhibits)

| id | num | sector | accent | statValue | statLabel | sort |
|---|---|---|---|---|---|---|
| `eng-001` | 001 | Civic policy | `policy` | `$106M` | Deployment matrix scope | 1 |
| `eng-002` | 002 | Land use | `civic` | `87` | Pages forensically analyzed | 2 |
| `eng-003` | 003 | Venture capital | `venture` | `$4.2B` | Combined addressable market framed | 3 |
| `eng-004` | 004 | Founder strategy | `founder` | `$73.7B` | Market entered with full architecture | 4 |
| `eng-005` | 005 | Education | `education` | `$243K–$473K` | Annual hidden costs quantified | 5 |
| `eng-006` | 006 | Design | `digital` | `48hrs` | Concept to production deployment | 6 |

Log-entry counts run 4–8 (`eng-002` has 4, `eng-005` has 8). All six sectors are
distinct, which is why the derived index copy reads "six sectors".

> ⚠️ **Client-data clearance.** `eng-001` cites `$106M` and "a major metropolitan
> area faced a systemic crisis"; `eng-004` cites `$73.7B` and a named market size.
> If these describe real clients, confirm the figures and identifying details are
> cleared for public use **before** amplifying them in a rewrite. Anonymising
> upward ("a major metropolitan area") is safer than specifying downward.

---

## 1. The data contract (hard gate)

Files are **JSON**, one per engagement, at `src/content/engagements/<id>.json`.
**The filename is the slug** — `eng-004.json` → `/engagements/eng-004/`.

Validated by Zod in `src/content.config.ts`. A violation **fails the build**.

```ts
const ENGAGEMENT_ACCENTS = ['policy','civic','venture','founder','education','digital'] as const;

z.object({
  num:            z.string().regex(/^\d{3}$/),   // REQUIRED — exactly 3 digits, quoted
  classification: z.string().min(1),             // REQUIRED
  sector:         z.string().min(1),             // REQUIRED
  accent:         z.enum(ENGAGEMENT_ACCENTS),    // REQUIRED — one of the 6 above
  statValue:      z.string().min(1),             // REQUIRED
  statLabel:      z.string().min(1),             // REQUIRED
  leads:          z.array(z.string().min(1)).min(1),      // REQUIRED — ≥1 paragraph
  highlights:     z.array(z.string().min(1)).min(1),      // REQUIRED — ≥1 log line
  heroImage:      image().optional(),            // optional — see §4
  heroAlt:        z.string().optional(),         // optional — but paired with heroImage
  sort:           z.number().int().optional(),   // optional — see §3
})
```

### Gotchas that will bite you

1. **`num` is a STRING, not a number.** `"004"` — not `4`. The regex demands
   exactly three digits, and `4` fails type validation before the regex runs.
2. **`statValue` / `statLabel` are required.** Every dossier renders a large stat
   block on the plaque; there is no "no stat" layout. If an engagement has no
   dollar figure, use a qualitative value (`"48hrs"`, `"87"`, `"9 chapters"`)
   rather than leaving it blank.
3. **`heroImage` + `heroAlt` are all-or-nothing.** See §4 — this is the single
   most dangerous field pair in the schema.
4. **`accent` is a closed enum.** Inventing `"crisis"` fails the build. Pick the
   nearest of the six.

### Canonical example

```json
{
  "num": "006",
  "classification": "Engagement 006 — Digital Platform & Spatial Design",
  "sector": "Design",
  "accent": "digital",
  "statValue": "48hrs",
  "statLabel": "Concept to production deployment",
  "heroImage": "./_images/eng-006.webp",
  "heroAlt": "Six-page immersive platform lobby rendered in cyan wireframe over deep navy, layered depth planes receding.",
  "leads": [
    "The brief was a website. What we built was an environment. A six-page immersive platform designed to feel like stepping into a near-future corporate lobby."
  ],
  "highlights": [
    "Real-time 3D rendering with atmospheric particle systems",
    "Spatial depth through layered parallax and WebGL",
    "Angular design system with zero border-radius constraint",
    "Serverless contact infrastructure",
    "Concept to production deployment in under 48hrs."
  ],
  "sort": 6
}
```

---

## 2. Field-by-field, with rendering consequences

### `num` — the registry number
Renders in **five** places: the giant ghost numeral on the plaque, the hall
locator (`Specimen 006/006`), the telemetry `Ref` cell (`ENG-006`), the plaque
`Registry` row, and both walk cards (`ENG-005` / `ENG-001`). It is the exhibit's
identity — keep it aligned with the filename (`eng-006.json` → `"006"`).
Duplicate `num` values are rejected by `scripts/check-engagement-hero.mjs`.

### `classification` — the formal title
Format: `Engagement NNN — Title Case Subject`.

The em-dash matters. `src/pages/engagements/[slug].astro` splits on `—` and uses
**everything after the first em-dash** as the `<h1>` and the walk-card titles:

```ts
function displayTitle(classification: string): string {
  const parts = classification.split('—');
  return (parts.length > 1 ? parts.slice(1).join('—') : classification).trim();
}
```

- `"Engagement 006 — Digital Platform & Spatial Design"` → h1 = **"Digital Platform & Spatial Design"**
- `"Digital Platform"` (no dash) → h1 = **"Digital Platform"** (whole string; works but loses the registry framing)
- Use a real em-dash `—` (U+2014), **not** a hyphen `-`.

`<h1>` renders uppercase with letter-spacing. Titles over ~45 characters wrap to
three lines in the sticky plaque; 3–5 words is the sweet spot.

**h1 uniqueness is enforced by E2E** — two engagements cannot share a title.

### `sector` — the taxonomy label
Short (1–3 words), rendered uppercase with wide letter-spacing in the plaque,
the telemetry strip, both walk cards, and the directory chips. It also feeds the
**derived meta description** on the hall index (§7), so keep it a clean noun
phrase: `"Civic policy"`, `"Founder strategy"`, `"Design"`.

### `accent` — the colour identity
Drives a two-stop CSS gradient (`--exh-a1` / `--exh-a2`) that themes the whole
dossier: locator, telemetry border and pulse dot, plaque top-rule and scan
sweep, stat glow, section numerals, log rail and markers, threshold line, walk
cards.

| accent | primary | reads as |
|---|---|---|
| `policy` | cyan-core → gold | institutional, default |
| `civic` | cyan-bright → deep teal | public, municipal |
| `venture` | gold-bright → cyan | capital, commercial |
| `founder` | cyan-core → cyan-bright | individual, velocity |
| `education` | gold-bright → cyan | pedagogical |
| `digital` | cyan-bright → cyan-core | technical, product |

Accent is a **visual** choice, not a semantic one. Adjacent exhibits in the walk
render each other's accent on the nav cards, so alternating gold and cyan across
the hall gives the walk visible rhythm. Avoid three consecutive gold entries.

### `statValue` / `statLabel` — the headline metric
`statValue` renders at `clamp(2rem, 4vw, 2.8rem)` with an accent glow inside the
sticky plaque (max 380px wide). Keep it **short** — 2–7 characters is the safe
band (`$106M`, `48hrs`, `87`, `$73.7B`).

The longest value currently shipping is `eng-005`'s `$243K–$473K` (11 chars).
It fits, but it is the practical ceiling: at ~12+ characters the value starts
shrinking the plaque's other content at tablet widths. If you need a range that
long, consider moving the range into `statLabel` and putting a single figure in
`statValue`.

`statLabel` is the small uppercase caption beneath it. 2–5 words
(`"Deployment matrix scope"`, `"Pages forensically analyzed"`). Both are plain
text — **no markup**.

`statValue` and `statLabel` also feed the dossier's meta description (§7), so a
vague label produces a vague search snippet. The generator composes
`Engagement NNN dossier — {sector}. {statValue} {statLabel}. {first lead…}`
and truncates at a word boundary to fit 178 chars. Current dossiers land at
166–174 characters, so a long `statLabel` eats words off the end of your lead
sentence rather than overflowing.

### `leads` — the mandate (⚠️ PLAIN TEXT ONLY)
An array of paragraphs under the "01 Mandate" heading, at `max-width: 62ch`,
1.8 line-height. This is the *narrative*: what the situation was, what was
missing, what you built.

> **🚫 `leads` renders as plain `{lead}` — markup does NOT work here.**
> An `<a>` or `<strong>` in `leads` appears on the page as literal escaped
> characters. `scripts/check-engagement-hero.mjs` fails the build if it finds
> element tags in `leads`. **Put links in `highlights` instead.**

Structure that works (from `eng-001`, `eng-004`):
1. **The condition** — "A major metropolitan area faced a systemic crisis…"
2. **The gap** — "…no shortage of proposals but no deployment architecture…"
3. **The intervention** — "We built the bridge between policy intent and fiscal execution."

One paragraph of 2–3 sentences is the current norm. Two or three short
paragraphs read well in the wider dossier column; the carousel card shows the
same text, so front-load the first sentence.

### `highlights` — the operations log (✅ MARKUP + LINKS ALLOWED)
An array rendered as a numbered timeline rail under "02 Operations log". Each
entry gets a `Log 01` index, a glowing accent marker, and a bordered panel with
a hover translate.

`data.highlights.length` becomes the telemetry `Log entries` readout
(zero-padded: 5 → `05`). **4–8 entries is the observed range** — the E2E
assertion on `eng-001` requires `>= 4`, and past ~8 the rail gets long enough to
bury the walk below it. Aim for 5–7.

Each entry is a **deliverable or a fact**, not a sentence about feelings:
- ✅ `"$106M deployment matrix mapping 8 funding sources to 17 endpoints"`
- ✅ `"9-chapter policy playbook anchored to RCT-validated intervention mathematics"`
- ❌ `"The client was very happy with the outcome"`

Convention: the **final** entry carries a period and states the delivery
velocity — `"Delivered to elected officials in 10 days."` /
`"Concept to production deployment in under 48hrs."` Earlier entries have no
terminal punctuation. Keep this; it's the closing beat of every exhibit.

---

## 3. `sort` — hall order and the exhibit walk

```ts
_sort: e.data.sort ?? Number.parseInt(e.data.num, 10)
// sorted by: _sort ascending, then num.localeCompare(num)
```

`sort` **overrides** numeric `num` order. Omit it and order follows `num`.

Use it when you want the hall sequenced differently from the registry — e.g.
adding `eng-007` but wanting it shown third (`"num": "007", "sort": 3`).
Duplicate `sort` values are rejected by the sentinel, because ties fall back to
`num` comparison and become hard to predict.

### The walk is a closed ring

```ts
const prev = all[(idx - 1 + total) % total];
const next = all[(idx + 1) % total];
```

Modulo arithmetic means **the hall has no dead ends**: the first exhibit's
`previous` is the last exhibit, and the last exhibit's `next` is the first.
A visitor can walk forever in one direction and see everything.

Consequences when you author:
- **Order is a narrative choice.** Adjacent exhibits are seen together on the
  walk cards. Sequence so neighbouring sectors contrast.
- **You never need to touch navigation.** Add a file and the ring re-forms.
- An E2E test (`exhibit walk is a closed ring`) follows `next` from the first
  exhibit and asserts it visits every dossier exactly once before wrapping. If
  you add an engagement and this fails, `sort` values are colliding.

---

## 4. Imagery — the specimen plate

### The trap you must know about

`heroImage` and `heroAlt` are **independently optional** in Zod. That accepts
four combinations, but only two render:

| `heroImage` | `heroAlt` | Zod | Renders | |
|---|---|---|---|---|
| absent | absent | pass | no plate | ✅ fine |
| present | present | pass | **plate renders** | ✅ fine |
| present | absent | pass | **NOTHING** | ❌ silent failure |
| absent | present | pass | nothing | ❌ orphan alt |

Rows 3 and 4 are the dangerous class: **the build succeeds and the image is
silently dropped.** `scripts/check-engagement-hero.mjs` now fails the build on
both, so you get a loud error instead of a missing image. **Always author them
as a pair.**

### How to add a plate

1. Drop the file in `src/content/engagements/_images/`. (Astro ignores
   `_`-prefixed directories, so nothing there is parsed as content.)
2. Name it after the entry: `eng-004.webp` for `eng-004.json`.
3. Reference it **relatively** so Astro's `image()` helper can resolve it:

```json
"heroImage": "./_images/eng-004.webp",
"heroAlt": "Eight cross-referenced strategy documents fanned across a desk, annotated in gold."
```

**Requirements:**
- Path **must** start with `./` or `../`. A bare `_images/x.webp` or an absolute
  `/images/x.webp` fails.
- **The file must exist.** Astro's `image()` fails the build on a missing file —
  this is a hard error, not a warning.
- Formats: `.webp`, `.png`, `.jpg`, `.jpeg`, `.avif`, `.gif`, `.svg`.
- **Ship ≥1600px wide.** Astro emits 600/960/1280/1600 AVIF + WebP variants and
  will not upscale.
- **Composed for 16:9.** The plate crops with `object-fit: cover`.
- `heroAlt` must be ≥12 chars and must **not** start with "Image"/"Photo"/
  "Graphic"/"Picture"/"Screenshot" — screen readers already announce it as an
  image. Describe the *content*. This text is also the social-embed alt.

### What the plate looks like

Rendered above the mandate, framed as a mounted museum plate — not a blog hero:
a thin accent hairline, two machined corner brackets (top-left, bottom-right),
and a `Plate NNN` tag in the lower-left. Slightly desaturated and
contrast-lifted to sit inside the lab palette. `<Picture>` emits AVIF → WebP →
original with `fetchpriority="high"` for LCP.

When present, the plate is also **promoted to the social embed** — `og:image`,
`og:image:width/height`, `og:image:alt`, and the Twitter card all switch from
the site default to your plate. This is the single highest-leverage reason to
add imagery: it changes how every shared link previews.

`data-testid="exhibit-hero"` if you need to assert on it.

---

## 5. Links — where they work and where they don't

| Field | Mechanism | Markup? |
|---|---|---|
| `leads` | `{lead}` | ❌ **No** — appears as literal text |
| `highlights` | `set:html={line}` | ✅ **Yes** — raw HTML injected |
| `statValue` / `statLabel` / `sector` / `classification` | plain interpolation | ❌ No |
| `heroAlt` | attribute | ❌ No |

`highlights` render through `set:html` in **both** the card (`ProofEntry.astro`)
and the dossier (`[slug].astro`), so a link there appears on both surfaces.

```json
"highlights": [
  "Architecture documented in the <a href=\"/praxis/what-the-matrix-metabolizes/\">Praxis archive</a>",
  "Built on the <strong>UCIM</strong> substrate",
  "Published at <a href=\"https://example.gov/report\" target=\"_blank\" rel=\"noopener noreferrer\">example.gov</a>"
]
```

**Rules the sentinel enforces:**
- Tags must be **balanced**. `set:html` injects raw — an unclosed `<strong>`
  corrupts the rest of the page.
- Every `<a>` needs an `href`.
- `target="_blank"` requires `rel="noopener noreferrer"`.
- Allowed tags: `a`, `strong`, `em`, `b`, `i`, `span`, `code`, `abbr`, `br`.

**Escaping:** literal `<`, `>`, `&` in prose must be written `&lt;`, `&gt;`,
`&amp;`. `"under <10 days"` will be parsed as a broken tag — write `&lt;10 days`.

**Security:** `set:html` is for **author-controlled, compile-time-static** data
only. Never pipe user-submitted or fetched content into `highlights`.

**Internal link targets** worth pointing at: `/praxis/<slug>/`, `/services/`,
`/lexicon/`, `/about/`, `/contact/`, `/engagements/<id>/`. Always trailing-slash
— the site builds with directory-style URLs and a missing slash costs a redirect.

---

## 6. The exhibition-hall design language

You asked for it to feel like an actual exhibition hall. It largely already
does — the vocabulary is in the markup. Author *with* it rather than against it.

| Element | Museum analogue | Fed by |
|---|---|---|
| `.exh-hall__locator` — `Specimen 004/006` | Gallery position marker | `num`, hall size |
| `.exh-telemetry` — Status / Ref / Sector / Log entries / Trace | Live instrument readout | `num`, `sector`, `highlights.length` |
| `.exh-plaque` (sticky) | Wall-mounted specimen label | `num`, `classification`, `sector`, stat |
| `.exh-plaque__scan` | Light sweep across the case | — (7s animation) |
| `.exh-plaque__num` (ghost numeral) | Accession number | `num` |
| `.exh-plate` | Mounted plate / illustration | `heroImage`, `heroAlt` |
| `01 Mandate` | Curatorial statement | `leads` |
| `02 Operations log` | Field notebook on the timeline rail | `highlights` |
| `.exh-nav` — prev / hall / next | Walk to the adjacent exhibit | `sort` ring |

**Fixed copy you cannot change from JSON:** `Status: Archive · Verified`,
`Trace: Intact`, `Engagement dossier` eyebrow, `Classified` framing,
`Open a similar engagement` CTA, `⌂ Hall index`, `Initiate Contact`.

**Voice notes.** The register is *forensic, declarative, unhyped*. Read
`eng-006` for the tone at its best: "The brief was a website. What we built was
an environment." Short declaratives. Concrete nouns. Numbers doing the
persuading. No adjectives where a figure will do. Never "leveraged",
"synergies", "best-in-class", or "passionate".

**To deepen the hall feel** without touching code: give every exhibit a
`heroImage` (an empty plate slot is the biggest gap right now); make `statValue`
genuinely specific; use `highlights` links to cross-reference Praxis articles so
the hall connects to the reading room; keep the closing "delivered in N days"
beat on every exhibit.

---

## 7. Derived copy — do not hardcode counts

The hall index used to hardcode *"Six engagements across six sectors"*. That
claim silently became false whenever the collection changed, **and** the meta
description is length-gated at 110–180 chars, so drifting copy could break the
build in a way that looks unrelated to the edit.

Both are now derived from the collection: the hero line reads
`{countWord} engagements across {sectorWord} sectors.` and the meta description
lists sector names until the 178-char budget is spent, then stops. Verified by
simulating a 7th exhibit: the copy became *"Seven engagements across seven
sectors…"* and the description self-trimmed a sector name to land at 178 chars,
inside the sentinel's 110–180 window.

**Implication for you: add or remove engagements freely.** The index copy, meta
description, hall locator totals, walk ring, directory chips, and E2E slug
discovery all follow automatically. Number words are hardcoded up to twelve; past
that the copy falls back to digits.

---

## 8. Adding, replacing, or removing an engagement

**To add:** create `src/content/engagements/eng-007.json` with all required
fields, `"num": "007"`, and a `sort` if you want a custom slot. Optionally add a
plate to `_images/`. Nothing else — index, directory, ring, sitemap, search index
and meta copy all update themselves.

**To replace content in place:** edit the JSON. Keep `num` and the filename
aligned. If you change `classification`, the `<h1>` and both neighbours' walk
cards change with it.

**To remove:** delete the file. ⚠️ **The URL dies.** If `/engagements/eng-003/`
has been shared or indexed, add a redirect rather than 404ing it. Prefer
*repurposing* the file (rewrite the content, keep the slug) over deleting.

**To renumber:** changing `num` changes the slug **and** the URL. Same caution.

---

## 9. Verification — run these before you're done

```bash
# Schema + fast structural gate (seconds) — run this constantly while authoring
node scripts/check-engagement-hero.mjs

# Full build — the only thing that validates Zod + resolves heroImage
npx astro build

# All 8 postbuild sentinels, incl. meta-description length
npm run postbuild

# Types + lint + unit
npm run check:all

# Exhibition-hall E2E (discovers slugs; ring + unique-h1 + chrome)
npx playwright test tests/e2e/exhibits.spec.ts
```

**Expected clean output:**
```
[check-engagement-hero] OK — 6 engagement(s); N with specimen plate; leads/highlights markup consistent; registry unique
[check-meta-descriptions] scanned 17 indexable page(s). Length range: 138–174 chars.
[build] 21 page(s) built
```

(Page and range figures move as you author. What matters is that nothing
**FAIL**s and the range stays inside 110–180.)

(Page and character counts shift as you add exhibits — each new engagement adds
one page and can widen the description range. Only the 110–180 bound is fixed.)

**Known pre-existing noise (not yours):** a CSS `Unexpected "}"` warning at
`<stdin>:680:2` during build. Verified present on clean `main`. Ignore it.

**Apostrophes and ampersands are safe in prose.** You may see older commits
where the meta-description generator stripped `'` and `&`. That was a workaround
for a bug in the sentinel itself — its regex ended the capture at the first
apostrophe and silently measured a truncated string, which let `/about` ship a
209-char description while the gate reported 130 and passed. The sentinel is now
quote-aware and entity-decoded, and the stripping is gone. Write `the firm's`
and `R&D` normally in `leads`. Only double quotes are removed, because Astro
escapes them to `&quot;` — 5 characters of a 180-character budget for no reader
benefit.

### What each gate catches

| Failure | Caught by |
|---|---|
| `num` not a 3-digit string, bad `accent`, missing required field | `astro build` (Zod) |
| `heroImage` without `heroAlt` (or vice versa) | `check-engagement-hero` |
| `heroImage` path missing / not relative / wrong format | `check-engagement-hero`, then `astro build` |
| Weak or redundant `heroAlt` | `check-engagement-hero` |
| Markup in `leads` | `check-engagement-hero` |
| Unbalanced tags / `<a>` without href / unsafe `_blank` in `highlights` | `check-engagement-hero` |
| Duplicate `num` or `sort` | `check-engagement-hero` |
| Meta description outside 110–180 chars | `check-meta-descriptions` |
| Fewer than 4 log entries on eng-001 | `exhibits.spec.ts` |
| Duplicate `<h1>` across exhibits | `exhibits.spec.ts` |
| Broken walk ring | `exhibits.spec.ts` |

---

## 10. Quick checklist for a new exhibit

- [ ] `src/content/engagements/eng-NNN.json`, filename matches `num`
- [ ] `num` is a **quoted** 3-digit string
- [ ] `classification` is `Engagement NNN — Title` with a real em-dash `—`
- [ ] `<h1>` (text after the dash) is unique across the hall, ≤45 chars
- [ ] `sector` is a clean 1–3 word noun phrase
- [ ] `accent` is one of the six; doesn't make three same-colour neighbours
- [ ] `statValue` 2–7 chars (11 is the hard ceiling); `statLabel` 2–5 words
- [ ] `leads`: 1–3 paragraphs, condition → gap → intervention, **no markup**
- [ ] `highlights`: 5–7 deliverables (4 min, 8 max); final one states delivery velocity with a period
- [ ] Any links live in `highlights`, balanced, `href` present, `_blank` has `rel="noopener noreferrer"`
- [ ] `heroImage` + `heroAlt` **both** present or **both** absent
- [ ] Plate ≥1600px wide, composed 16:9, in `_images/`, referenced `./_images/…`
- [ ] `sort` set only if custom order needed; no duplicate `sort`
- [ ] Client figures cleared for public use
- [ ] `node scripts/check-engagement-hero.mjs` → OK
- [ ] `npx astro build && npm run postbuild` → clean
- [ ] `npx playwright test tests/e2e/exhibits.spec.ts` → pass

---

## 11. Files you may need to read

| Path | Why |
|---|---|
| `src/content.config.ts` | The Zod schema (lines ~102–118) |
| `src/content/engagements/*.json` | The 6 existing entries |
| `src/content/engagements/_images/README.md` | Plate conventions |
| `src/pages/engagements/[slug].astro` | Dossier template — all rendering |
| `src/pages/engagements.astro` | Hall index + derived copy |
| `src/components/ProofEntry.astro` | Carousel card |
| `src/components/EngagementCarousel.astro` | Carousel shell |
| `scripts/check-engagement-hero.mjs` | The sentinel + its rationale |
| `tests/e2e/exhibits.spec.ts` | Structural expectations |
| `handoff/PRAXIS-AUTHORING-PRIMER.md` | Companion primer for Praxis articles |
