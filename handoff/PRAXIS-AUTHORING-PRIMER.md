# Praxis Authoring Primer — context pack for a fresh chat thread

Paste this whole file as the first message of a new thread, then add your own
brief for the specific article(s) you want written.

**Repo:** `nprimm1992-ui/sarifWS` · **Collection:** `src/content/praxis/`
**Renderer:** `src/pages/praxis/[slug].astro` · **Index:** `src/pages/praxis.astro`

---

## 0. Current state of the corpus — read this first

| Slug | Status | Body |
|---|---|---|
| `what-the-matrix-metabolizes` | **published** | ~1,410 words — real |
| `one-operator-one-intelligence-layer` | **published** | ~1,150 words — real |
| `pipelines-move-forward-systems-circulate` | **published** | ~1,240 words — real |
| `the-conductor-is-the-coherence-layer` | **published** | ~1,270 words — real |
| `signal-without-noise` | **published** | ~1,230 words — real |
| `coherence-decay-in-distributed-teams` | **published** | ~1,410 words — real |

**The corpus is now six real articles and nothing else.** Every placeholder
has been retired.

No. 06 is the first Praxis article to carry an **external citation** (Carter et
al., *Prehospital Emergency Care* 2009, on trauma-handover information loss).
The house pattern established there: attribute in prose, do **not** hyperlink —
no Praxis article has ever carried an outbound link, and the citation reads as
provenance rather than as a referral. It also fixed a fabricated `41%`
"post-vote re-narration audit" figure that had shipped in No. 01 and was about
to be inherited by No. 06; it is now the dossier-attested `$5.6M → $0`
execution-gap catch. See §9.

Three were retired by being *written over*, so the slug carried an article
instead of becoming a dead link: `signal-without-noise` →
`pipelines-move-forward-systems-circulate` (No. 03), `the-briefing-as-interface`
→ `the-conductor-is-the-coherence-layer` (No. 04), and `coherence-decay-in-teams`
→ a genuine `signal-without-noise` (No. 05), reclaiming the original slug for
the article it was always meant to carry.

The remaining **seven were deleted outright** — `forensic-depth-in-policy-work`,
`intelligence-substrate-economics`, `jensen-as-operational-memory`,
`metabolic-knowledge-graphs`, `production-grade-strategic-material`,
`trace-as-audit-infrastructure`, `ucim-field-notes`. They were
scaffold-generated with interchangeable 73-word bodies to trip a 12-article
threshold that no longer exists (the Ask Praxis feature that needed it was
removed). Keeping them would have meant shipping filler to satisfy a
requirement that had already been deleted.

### Writing a new article — there is no stub to fill

Because every placeholder is gone, a new article is a **new file**, and you own
three things the scaffold used to pre-fill:

1. **The number.** Take the next unused one. `classification` is the authored
   source of truth for the reference number rendered on three surfaces, and
   `check-praxis-layout.mjs` enforces agreement and uniqueness — it does **not**
   enforce contiguity, so a gap is legal but pointless.
2. **The hero image.** `heroImage` is `image()` in the schema, so a missing or
   misspelled path is a hard build failure, not a warning. Author a real card;
   the five shipping ones are the fidelity bar.
3. **`MIN_PRAXIS_ARTICLES` in `scripts/check-praxis-layout.mjs`** — raise it.
   It is a graduated coverage floor: if it stays behind the true count, the
   gate can pass while measuring fewer articles than exist.

Recommended posture: **4–6 excellent articles, not 12 thin ones.** The firm's
own thesis argues against padding, and a corpus that advertises "every claim
carries its trace" cannot ship pages that carry nothing. At five, the corpus is
inside that band; write No. 06 because it has something to say.

---

## 1. Hard schema — the build FAILS if you violate this

From `src/content.config.ts`. Zod-validated at build time, not a warning.

```yaml
---
title: "string"                       # REQUIRED, min 1 char
summary: "string"                     # REQUIRED, **130–180 chars inclusive**
publishDate: 2026-04-12               # REQUIRED, YYYY-MM-DD
lens: "string"                        # REQUIRED, free text (see §2 for values in use)
horizon: "string"                     # REQUIRED, free text
phase: "string"                       # REQUIRED, free text
tags: ["A", "B"]                      # optional, defaults []
heroImage: "./_images/<slug>.svg"     # REQUIRED — file must exist
heroAlt: "string"                     # REQUIRED, min 1 char
classification: "string"              # optional
relatedTerms: ["UCIM", "Jensen"]      # optional — see §3, must match real terms
relatedArticles: ["other-slug"]       # optional — must be a real slug
outroIntent: "reach"                  # optional, ONLY "read" | "reach", default "reach"
draft: true                           # optional, default false
---
```

### The two that bite hardest

**`summary` must be 130–180 characters.** Not words. Under 130 or over 180 and
the build stops with a Zod error. There is *also* a separate postbuild sentinel
(`scripts/check-meta-descriptions.mjs`) enforcing the same range on rendered
pages. Count the characters.

**`heroImage` must be a file that exists** at `src/content/praxis/_images/`.
Astro resolves and optimizes it, so a missing or misspelled path is a hard
build failure. Existing images are `.svg` title cards named after the slug.
If you add a new article you must add its image too — see §5.

---

## 2. Facet vocabulary currently in use

These are free-text in the schema, but `/praxis/` builds its filter UI from the
distinct values present. **Inventing new ones fragments the filters**, so reuse
unless you intend a new facet.

- **`lens`** — **effectively a closed vocabulary: the nine lexicon term names,
  plus `Methodology`.** In use on published articles: `Methodology`, `Trace`,
  `Epistemic Mode`. Placeholders also carry `UCIM`, `Jensen`,
  `Coherence Decay`, `Metabolic Knowledge` — those disappear if you delete
  those files.

  > **`Operational Rigor` is NOT a valid lens.** This line previously listed it
  > and a No. 05 draft was authored against it. It is not a lexicon term and no
  > article has ever shipped with it. `lens` feeds the `/praxis/` facet bar
  > directly (`praxis.astro:17`), so an off-vocabulary value paints a filter
  > pill matching exactly one article. If the lens you want isn't a lexicon
  > term, that is a signal the *lexicon* needs the entry first.

- **`classification` suffix** — a closed **two**-value set: `Methodology` and
  `Field Observation`. The pairing is mechanical, not editorial:

  | `lens` | suffix |
  |---|---|
  | `Methodology` | `Methodology` |
  | anything else | `Field Observation` |

  So No. 01 (`lens: Trace`) and No. 05 (`lens: Epistemic Mode`) both take
  `Field Observation`; No. 02–04 take `Methodology`. **Do not mirror a
  non-Methodology lens into the suffix** — it renders in the article eyebrow
  and would introduce a third category that nothing else shares.

- **`horizon`** — `Near-term`, `Mid-term`, `Long-term` *(not faceted, so a new
  value here is low-risk — unlike `lens` and `tags`, which are)*
- **`phase`** — `Draft`, `Published` *(keep in sync with the `draft:` boolean —
  `phase: "Published"` + `draft: true` is contradictory)*
- **`tags`** in use — `Methodology`, `Systems`, `UCIM`, `Field Observation`,
  `Operating Model`, `Trace`

---

## 3. Lexicon terms — the ONLY valid `relatedTerms` values

`relatedTerms` deep-links into the Lexicon Atlas graph. A term that doesn't
exist produces a dead link. Exact strings, from `src/content/lexicon/`:

```
01  Augment Your Intelligence
02  Coherence Decay
03  Metabolic Knowledge
04  Jensen
05  UCIM
07  Trace
08  Epistemic Mode
10  Briefing
11  Praxis
```

That's the complete set — **9 terms.** Do not invent others.

Prose can also link inline with `<LexiconTermLink term="UCIM">…</LexiconTermLink>`
(see §4), and `<NoLex>` opts a passage out of automatic term linking.

---

## 4. MDX components available in the body

Registered in `src/components/mdx/mdx-components.ts`. Use these; don't hand-roll
HTML for these jobs.

```mdx
<Pullquote classification="FIELD NOTE" attribution="Praxis">
Coherence is not a quality-control outcome. It is an architectural property.
</Pullquote>

<Stat value="41%" label="Analytic substance lost across four re-narration layers" />

<Callout kind="note" title="Optional title">
Body text. `kind` is ONLY: "note" | "warning" | "classified"
</Callout>

<!-- House form: `timestamp` is a HUMAN LABEL, not a date. -->
<FieldLog timestamp="Engagement 004 retro" source="Field observation">
Observation text.
</FieldLog>

<!-- Only if the entry has a REAL calendar date, add `datetime` as well.
     `timestamp` stays human; `datetime` is the machine-readable form. -->
<FieldLog timestamp="June 14, 2026" datetime="2026-06-14" source="Field observation">
Observation text.
</FieldLog>

<Figure src={someImport} alt="Required" caption="Optional" classification="Optional" />

<Sidenote>Marginal aside.</Sidenote>

<LexiconTermLink term="UCIM">the matrix</LexiconTermLink>

<NoLex>Text here is exempt from automatic lexicon linking.</NoLex>
```

**Exact prop contracts:**

| Component | Required | Optional |
|---|---|---|
| `Pullquote` | *(children)* | `attribution`, `classification`, `class` |
| `Stat` | `value` | `label`, `class` |
| `Callout` | *(children)* | `kind` (`note`\|`warning`\|`classified`), `title`, `class` |
| `FieldLog` | `timestamp` (human label) | `datetime` (**machine date only**), `source`, `class` |
| `Figure` | `src` (ImageMetadata), `alt` | `classification`, `caption`, `widths`, `sizes`, `fetchpriority`, `loading`, `class` |
| `Sidenote` | *(children)* | `class` |
| `LexiconTermLink` | `term` | — |
| `NoLex` | *(children)* | — |

`Figure`'s `src` is an **imported image object**, not a string path:
```mdx
import diagram from './_images/my-diagram.svg';
<Figure src={diagram} alt="…" />
```

---

## 5. Adding a new article — the full checklist

1. Create `src/content/praxis/<slug>.mdx` — slug becomes the URL
   (`/praxis/<slug>/`), so keep it lowercase-hyphenated.
2. Create the hero image at `src/content/praxis/_images/<slug>.svg`.
   Existing cards follow a template: dark field, cyan `PRAXIS NO. NN` eyebrow in
   Orbitron, title in light grey. Copy an existing SVG and edit the two text
   nodes — that keeps the set visually consistent.
3. Fill frontmatter per §1. **Count your summary characters.**
4. Set `classification` to `"Praxis No. NN — <Category>"` matching the number in
   the hero image.
5. Write the body (§6).
6. Set `draft: false` **and** `phase: "Published"` only when it's genuinely done.
7. Run `npm run build` — Zod + sentinels will reject anything malformed.

### Layout contract (enforced by `scripts/check-praxis-layout.mjs`)

The template emits, in this DOM order: header → title plate → hero → **body** →
seal → **outro** → footer. Your MDX only supplies the body. Don't try to emit
your own outro or footer; the sentinel fails the build if order breaks.

---

## 6. Voice and structure — derived from the two real articles

Study `what-the-matrix-metabolizes.mdx` and
`one-operator-one-intelligence-layer.mdx` before writing. Observed patterns:

**Length:** 1,100–1,450 words. Long enough to argue, short enough to hold.

**Opening move:** state a hard, specific claim or a real question a client asks.
No throat-clearing, no "in today's landscape."
> "The hardest question a client asks in the first thirty minutes of an
> engagement is not *'what does Sarif do?'* It is *'what do you actually know?'*"

**Structure:** 3–5 `##` sections with declarative, non-generic headings —
"What the model actually is", "What decays and what doesn't", "What becomes
possible". Not "Introduction" / "Conclusion".

**Rhythm:** long analytical paragraph, then a short flat sentence as a landing.
> "That constraint broke."

**Evidence:** cite concrete engagement figures — `$106M`, `41%`, `ten days`,
`73-assumption register`, `$52.1M`. Anchor to a specific engagement where possible

> ⚠️ **Every figure must exist in a dossier.** This line previously offered
> `87-page` and `$73.7B` as examples. Neither appears in any engagement JSON:
> `87-page` described a "forensic regulatory teardown" that does not exist
> (`eng-003` is the regulatory work — five nodes, two OSB opinions, a 17-slide
> deck), and `eng-004` cites `$206B` and `$868B`, never `$73.7B`. Both were
> published in Praxis No. 01, one was repeated in No. 03, and both were being
> taught here. `scripts/check-praxis-claims.mjs` now gates this class of claim;
> if you invent a figure to make a sentence land, the build will stop you
("Engagement 001, post-vote audit"). Surface the number in a `<Stat>`.

**Stance:** structural, not promotional. Sarif describes architecture and
tradeoffs — "It is not a product spec. It is an operating disclosure." Failure
modes are named as *inevitabilities of architecture*, not as competitor
mistakes.

**Terminology:** use the capitalised proper nouns exactly — Coherence Decay,
Metabolic Knowledge, UCIM, Jensen, Trace, Briefing, Epistemic Mode.

**Avoid:** marketing adjectives ("cutting-edge", "seamless", "world-class"),
em-dash-free breathless lists, rhetorical questions in series, and any claim
you can't attach evidence to.

### Escaping

Literal `<`, `>`, `&` in prose must be `&lt;` `&gt;` `&amp;` — MDX will
otherwise read them as markup. (The one file that used to carry a **UTF-8 BOM**,
`the-briefing-as-interface.mdx`, has since been deleted; no current file has
one. Check anyway if you paste from an external editor.)

---

## 7. What was just removed (so you don't reference it)

The **Ask Praxis** feature is gone: `src/components/PraxisAsk.astro`,
`src/scripts/praxis-ask.js`, `functions/api/ask.js`,
`scripts/generate-praxis-corpus.mjs`, the `PRAXIS_ASK_MIN_CORPUS` gate, and its
two E2E specs. Reason: it was a keyword matcher branded as "Ask", it was gated
off and invisible anyway (needed 12 published, had 2), and a real Jensen chat
integration is planned instead. **There is no longer any article-count
threshold to hit.** Write as few or as many as you actually mean.

`/search-index.json` still exists and still indexes Praxis — it powers the
command palette. Leave it alone.

---

## 8. Verify before you hand back

```bash
npm run build          # Zod schema + 16 postbuild steps (14 gating, 1 warns, 1 injector)
npm run check:types    # expect 0 errors 0 warnings
npx playwright test    # expect 0 failures
```

A green `npm run build` is the real gate — summary length, hero image
resolution, layout contract and meta-description range are all enforced there.

---

## 8. `FieldLog` timestamps — why there are two props

`timestamp` is what the reader sees. `datetime` is what a machine reads.
They are separate props because the house voice labels field entries by
engagement, not by clock:

```
timestamp="Engagement 004 retro"     <- correct, no datetime
timestamp="June 14, 2026" datetime="2026-06-14"   <- correct, dated
timestamp="2026-02-18T00:00Z"        <- wrong shape for the house voice
```

The component used to copy `timestamp` straight into the rendered
`datetime` attribute. Because the convention is a label, two published
articles shipped `<time datetime="Engagement 004 retro">`, which is not a
parseable date and therefore an invalid machine-readable promise. `astro
build` and `astro check` both exited 0 on it; no sentinel looked at
`datetime` at all.

Now:

* supply `datetime` → renders `<time datetime="...">`, validated at build
  time against the HTML date grammar (bad value = hard build failure);
* omit `datetime` → renders a `<span>` with identical styling, because an
  entry with no real date should not claim to be a `<time>`.

Visual output is the same either way. `scripts/check-field-log-datetime.mjs`
re-checks every `<time>` in the built HTML so this cannot regress from any
component, with a graduated coverage floor so a markup rename fails loudly
instead of silently measuring nothing.
