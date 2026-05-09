# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: round4.spec.ts >> command palette traps focus — tab cycles back inside palette
- Location: tests\e2e\round4.spec.ts:99:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: keyboard.press: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to main content" [ref=e2]:
    - /url: "#main-content"
  - banner [ref=e4]:
    - navigation "Main navigation" [ref=e5]:
      - link "Sarif Consulting — Home" [ref=e6]:
        - /url: /
        - text: SARIF CONSULTING
      - list [ref=e7]:
        - listitem [ref=e8]:
          - link "About" [ref=e9]:
            - /url: /about/
        - listitem [ref=e10]:
          - link "Engagements" [ref=e11]:
            - /url: /engagements/
        - listitem [ref=e12]:
          - link "Services" [ref=e13]:
            - /url: /services/
        - listitem [ref=e14]:
          - link "Praxis" [ref=e15]:
            - /url: /praxis/
        - listitem [ref=e16]:
          - link "Contact" [ref=e17]:
            - /url: /contact/
  - main [ref=e19]:
    - region "Praxis" [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - paragraph [ref=e23]: Learn more
          - heading "Praxis" [level=1] [ref=e24]
          - generic [ref=e25]:
            - heading "Practice made public. Intelligence architecture, ethics, systems design." [level=2] [ref=e26]
            - paragraph [ref=e27]: Praxis is the Sarif publication where operational thinking, methodology in progress and architectural observations are published as they are developed — not retrofitted into polished deliverables. Each piece is an operational position that has already been tested against real engagements before it is written up. Expect a single considered release per month, not a feed.
        - complementary "Filter Praxis articles" [ref=e28]:
          - paragraph [ref=e29]: Filter
          - generic [ref=e30]:
            - paragraph [ref=e31]: lens
            - list [ref=e32]:
              - listitem [ref=e33]:
                - button "Architectural Depth" [ref=e34] [cursor=pointer]
              - listitem [ref=e35]:
                - button "Methodology" [ref=e36] [cursor=pointer]
          - generic [ref=e37]:
            - paragraph [ref=e38]: tags
            - list [ref=e39]:
              - listitem [ref=e40]:
                - button "Field Observation" [ref=e41] [cursor=pointer]
              - listitem [ref=e42]:
                - button "Methodology" [ref=e43] [cursor=pointer]
              - listitem [ref=e44]:
                - button "Operating Model" [ref=e45] [cursor=pointer]
              - listitem [ref=e46]:
                - button "Systems" [ref=e47] [cursor=pointer]
              - listitem [ref=e48]:
                - button "UCIM" [ref=e49] [cursor=pointer]
          - button "Clear all Praxis filters" [ref=e50] [cursor=pointer]: Clear filters
        - list [ref=e51]:
          - listitem [ref=e52]:
            - generic: "01"
            - link "Praxis No. 01 Apr 11, 2026 Architectural Depth One Operator, One Intelligence Layer The consulting model that eliminates coherence decay is not a larger team. It is a smaller one — with a persistent intelligence substrate underneath it." [ref=e53]:
              - /url: /praxis/one-operator-one-intelligence-layer/
              - generic [ref=e54]:
                - generic [ref=e55]: Praxis No. 01
                - time [ref=e57]: Apr 11, 2026
              - generic [ref=e58]: Architectural Depth
              - heading "One Operator, One Intelligence Layer" [level=3] [ref=e59]
              - paragraph [ref=e60]: The consulting model that eliminates coherence decay is not a larger team. It is a smaller one — with a persistent intelligence substrate underneath it.
          - listitem [ref=e62]:
            - generic: "02"
            - link "Praxis No. 02 Apr 11, 2026 Methodology What the Matrix Metabolizes UCIM is not a knowledge base. It is a digestive system. What the matrix ingests, reinforces and discards across an engagement — and why the distinction matters." [ref=e63]:
              - /url: /praxis/what-the-matrix-metabolizes/
              - generic [ref=e64]:
                - generic [ref=e65]: Praxis No. 02
                - time [ref=e67]: Apr 11, 2026
              - generic [ref=e68]: Methodology
              - heading "What the Matrix Metabolizes" [level=3] [ref=e69]
              - paragraph [ref=e70]: UCIM is not a knowledge base. It is a digestive system. What the matrix ingests, reinforces and discards across an engagement — and why the distinction matters.
  - contentinfo [ref=e72]:
    - generic [ref=e73]:
      - paragraph [ref=e74]:
        - generic [ref=e75]: © 2026 Sarif Consulting
        - generic [ref=e76]: ·
        - generic [ref=e77]: Portland, Oregon
      - generic [ref=e78]:
        - navigation "Footer navigation" [ref=e79]:
          - link "Lexicon" [ref=e80]:
            - /url: /lexicon/
          - generic [ref=e81]: ·
          - link "Privacy" [ref=e82]:
            - /url: /privacy/
          - generic [ref=e83]: ·
          - link "Terms" [ref=e84]:
            - /url: /terms/
          - generic [ref=e85]: ·
          - link "Accessibility" [ref=e86]:
            - /url: /accessibility/
        - group "Search and ambient audio" [ref=e87]:
          - button "Open search (Ctrl+K)" [ref=e88] [cursor=pointer]:
            - img [ref=e89]
            - generic [ref=e92]: ⌘K
          - button "Toggle ambient audio" [ref=e93] [cursor=pointer]:
            - generic [ref=e98]: "OFF"
            - generic [ref=e99]: "Ambient audio:"
    - region "Cookie and infrastructure notice" [ref=e100]:
      - generic [ref=e101]:
        - paragraph [ref=e102]:
          - text: Strictly necessary cookies only — no third-party advertising or behavioural tracking.
          - link "Details" [ref=e103]:
            - /url: /privacy#cookies
          - text: .
        - button "Dismiss" [ref=e104] [cursor=pointer]
  - dialog "Command" [ref=e105]:
    - button "Close command palette" [ref=e106]
    - document [ref=e107]:
      - banner [ref=e108]:
        - generic [ref=e109]:
          - generic [ref=e110]:
            - generic [ref=e111]: ❯
            - generic [ref=e112]: NAVIGATE · SARIF
          - generic [ref=e113]:
            - generic [ref=e114]: ⌘
            - generic [ref=e115]: K
        - heading "Command" [level=2] [ref=e116]
        - paragraph [ref=e117]:
          - text: Search Praxis, Lexicon, Engagements, and pages. Press
          - generic [ref=e118]: /
          - text: anywhere to reopen.
      - generic [ref=e119]:
        - img [ref=e120]
        - combobox "Search the site" [expanded] [active] [ref=e122]
        - generic [ref=e123]: ESC
      - toolbar "Filter by type" [ref=e124]:
        - button "All" [pressed] [ref=e125] [cursor=pointer]:
          - generic [ref=e126]: ◆
          - generic [ref=e127]: All
          - generic [ref=e128]: "14"
        - button "Praxis" [ref=e129] [cursor=pointer]:
          - generic [ref=e130]: P
          - generic [ref=e131]: Praxis
          - generic [ref=e132]: "2"
        - button "Lexicon" [ref=e133] [cursor=pointer]:
          - generic [ref=e134]: L
          - generic [ref=e135]: Lexicon
          - generic [ref=e136]: "6"
        - button "Engagements" [ref=e137] [cursor=pointer]:
          - generic [ref=e138]: E
          - generic [ref=e139]: Engagements
          - generic [ref=e140]: "0"
        - button "Pages" [ref=e141] [cursor=pointer]:
          - generic [ref=e142]: §
          - generic [ref=e143]: Pages
          - generic [ref=e144]: "6"
      - listbox "Search results" [ref=e145]:
        - text: Praxis
        - option "One Operator, One Intelligence Layer The consulting model that eliminates coherence decay is not a larger team. It is a smaller one — with a persistent intelligence substrate underneath it. Architectural Depth · Long-term · Published" [selected] [ref=e146] [cursor=pointer]:
          - generic [ref=e147]: P
          - generic [ref=e148]:
            - generic [ref=e150]: One Operator, One Intelligence Layer
            - paragraph [ref=e151]: The consulting model that eliminates coherence decay is not a larger team. It is a smaller one — with a persistent intelligence substrate underneath it.
            - generic [ref=e152]: Architectural Depth · Long-term · Published
          - generic [ref=e153]: ↵
        - option "What the Matrix Metabolizes UCIM is not a knowledge base. It is a digestive system. What the matrix ingests, reinforces and discards across an engagement — and why the distinction matters. Methodology · Long-term · Published" [ref=e154] [cursor=pointer]:
          - generic [ref=e155]: P
          - generic [ref=e156]:
            - generic [ref=e158]: What the Matrix Metabolizes
            - paragraph [ref=e159]: UCIM is not a knowledge base. It is a digestive system. What the matrix ingests, reinforces and discards across an engagement — and why the distinction matters.
            - generic [ref=e160]: Methodology · Long-term · Published
          - generic [ref=e161]: ↵
        - text: Lexicon
        - option "Architectural Depth discipline The degree to which a deliverable connects surface recommendations to underlying system structure. Shallow work gives clients what to do. Deep work gives them why, how the components interact, what breaks first, and what follow-on decisions the current one triggers. Architectural depth is the signature Sarif applies to every engagement, regardless of domain. L-06 · DISCIPLINE" [ref=e162] [cursor=pointer]:
          - generic [ref=e163]: L
          - generic [ref=e164]:
            - generic [ref=e165]:
              - generic [ref=e166]: Architectural Depth
              - generic [ref=e167]: discipline
            - paragraph [ref=e168]: The degree to which a deliverable connects surface recommendations to underlying system structure. Shallow work gives clients what to do. Deep work gives them why, how the components interact, what breaks first, and what follow-on decisions the current one triggers. Architectural depth is the signature Sarif applies to every engagement, regardless of domain.
            - generic [ref=e169]: L-06 · DISCIPLINE
          - generic [ref=e170]: ↵
        - option "Augment Your Intelligence doctrine Sarif's operating principle. A consulting engagement should not hand a client an artifact and walk away. It should install an intelligence layer that persists, adapts and compounds. Every deliverable, every session, every decision flows through an augmented cognitive substrate that the client can reason against long after the engagement ends. L-01 · DOCTRINE" [ref=e171] [cursor=pointer]:
          - generic [ref=e172]: L
          - generic [ref=e173]:
            - generic [ref=e174]:
              - generic [ref=e175]: Augment Your Intelligence
              - generic [ref=e176]: doctrine
            - paragraph [ref=e177]: Sarif's operating principle. A consulting engagement should not hand a client an artifact and walk away. It should install an intelligence layer that persists, adapts and compounds. Every deliverable, every session, every decision flows through an augmented cognitive substrate that the client can reason against long after the engagement ends.
            - generic [ref=e178]: L-01 · DOCTRINE
          - generic [ref=e179]: ↵
        - 'option "Briefing engagement The public entry point to working with Sarif. A Briefing is a scoped, fixed-fee engagement: the firm studies a single question, delivers a signed dossier with trace, and ends. No retainer, no open-ended commitment. Many Briefings become deeper engagements; many remain standalone. Both outcomes are legitimate. L-10 · ENGAGEMENT" [ref=e180] [cursor=pointer]':
          - generic [ref=e181]: L
          - generic [ref=e182]:
            - generic [ref=e183]:
              - generic [ref=e184]: Briefing
              - generic [ref=e185]: engagement
            - paragraph [ref=e186]: "The public entry point to working with Sarif. A Briefing is a scoped, fixed-fee engagement: the firm studies a single question, delivers a signed dossier with trace, and ends. No retainer, no open-ended commitment. Many Briefings become deeper engagements; many remain standalone. Both outcomes are legitimate."
            - generic [ref=e187]: L-10 · ENGAGEMENT
          - generic [ref=e188]: ↵
        - option "Coherence Decay doctrine The degradation that occurs when work passes through too many hands, too many meetings or too many translation layers. Every handoff strips context. Every summary compresses nuance. By the time a strategy reaches execution, or a diagnosis reaches the decision-maker, most of the original signal has been lost. Coherence decay is why large firms produce thick decks with thin insight. L-02 · DOCTRINE" [ref=e189] [cursor=pointer]:
          - generic [ref=e190]: L
          - generic [ref=e191]:
            - generic [ref=e192]:
              - generic [ref=e193]: Coherence Decay
              - generic [ref=e194]: doctrine
            - paragraph [ref=e195]: The degradation that occurs when work passes through too many hands, too many meetings or too many translation layers. Every handoff strips context. Every summary compresses nuance. By the time a strategy reaches execution, or a diagnosis reaches the decision-maker, most of the original signal has been lost. Coherence decay is why large firms produce thick decks with thin insight.
            - generic [ref=e196]: L-02 · DOCTRINE
          - generic [ref=e197]: ↵
        - option "Epistemic Mode discipline The honesty layer on every Sarif output. Every substantive claim is tagged as grounded (directly supported by source material), inferred (reasoned from evidence but not explicitly stated) or uncertain (Sarif's best read, flagged as such). Clients never have to guess which is which. Ambiguity is surfaced, not hidden behind confident prose. L-08 · DISCIPLINE" [ref=e198] [cursor=pointer]:
          - generic [ref=e199]: L
          - generic [ref=e200]:
            - generic [ref=e201]:
              - generic [ref=e202]: Epistemic Mode
              - generic [ref=e203]: discipline
            - paragraph [ref=e204]: The honesty layer on every Sarif output. Every substantive claim is tagged as grounded (directly supported by source material), inferred (reasoned from evidence but not explicitly stated) or uncertain (Sarif's best read, flagged as such). Clients never have to guess which is which. Ambiguity is surfaced, not hidden behind confident prose.
            - generic [ref=e205]: L-08 · DISCIPLINE
          - generic [ref=e206]: ↵
        - 'option "Jensen substrate Jensen is Sarif''s intelligence layer. A graph-grounded reasoning system that metabolizes every engagement''s context into a persistent operating memory. Jensen is how a single operator runs work that would otherwise require a team: research, synthesis, modeling, strategy, documentation and risk analysis are orchestrated through one coherent substrate rather than distributed across disconnected roles. L-04 · SUBSTRATE" [ref=e207] [cursor=pointer]':
          - generic [ref=e208]: L
          - generic [ref=e209]:
            - generic [ref=e210]:
              - generic [ref=e211]: Jensen
              - generic [ref=e212]: substrate
            - paragraph [ref=e213]: "Jensen is Sarif's intelligence layer. A graph-grounded reasoning system that metabolizes every engagement's context into a persistent operating memory. Jensen is how a single operator runs work that would otherwise require a team: research, synthesis, modeling, strategy, documentation and risk analysis are orchestrated through one coherent substrate rather than distributed across disconnected roles."
            - generic [ref=e214]: L-04 · SUBSTRATE
          - generic [ref=e215]: ↵
        - text: Pages
        - option "Home Landing lobby — overview of Sarif Consulting." [ref=e216] [cursor=pointer]:
          - generic [ref=e217]: §
          - generic [ref=e218]:
            - generic [ref=e220]: Home
            - paragraph [ref=e221]: Landing lobby — overview of Sarif Consulting.
          - generic [ref=e222]: ↵
        - option "Services Capabilities across intelligence, digital, narrative, and media." [ref=e223] [cursor=pointer]:
          - generic [ref=e224]: §
          - generic [ref=e225]:
            - generic [ref=e227]: Services
            - paragraph [ref=e228]: Capabilities across intelligence, digital, narrative, and media.
          - generic [ref=e229]: ↵
        - option "Engagements Case dossiers from recent work." [ref=e230] [cursor=pointer]:
          - generic [ref=e231]: §
          - generic [ref=e232]:
            - generic [ref=e234]: Engagements
            - paragraph [ref=e235]: Case dossiers from recent work.
          - generic [ref=e236]: ↵
        - option "Lexicon Operational vocabulary and framework references." [ref=e237] [cursor=pointer]:
          - generic [ref=e238]: §
          - generic [ref=e239]:
            - generic [ref=e241]: Lexicon
            - paragraph [ref=e242]: Operational vocabulary and framework references.
          - generic [ref=e243]: ↵
        - option "Praxis Field-notes and long-form analyses." [ref=e244] [cursor=pointer]:
          - generic [ref=e245]: §
          - generic [ref=e246]:
            - generic [ref=e248]: Praxis
            - paragraph [ref=e249]: Field-notes and long-form analyses.
          - generic [ref=e250]: ↵
        - option "About Methodology, team, and operating principles." [ref=e251] [cursor=pointer]:
          - generic [ref=e252]: §
          - generic [ref=e253]:
            - generic [ref=e255]: About
            - paragraph [ref=e256]: Methodology, team, and operating principles.
          - generic [ref=e257]: ↵
      - contentinfo [ref=e258]:
        - generic [ref=e259]:
          - generic [ref=e260]: ↑
          - generic [ref=e261]: ↓
          - generic [ref=e262]: navigate
        - generic [ref=e263]:
          - generic [ref=e264]: ⏎
          - generic [ref=e265]: open
        - generic [ref=e266]:
          - generic [ref=e267]: ⌘
          - generic [ref=e268]: ⏎
          - generic [ref=e269]: new tab
        - generic [ref=e270]:
          - generic [ref=e271]: tab
          - generic [ref=e272]: scope
        - generic [ref=e273]:
          - generic [ref=e274]: esc
          - generic [ref=e275]: close
  - status
```

# Test source

```ts
  12  |  *   3. Command palette traps focus while open (Tab cycles back to
  13  |  *      the input, never escapes into the backgrounded page).
  14  |  *   4. Command palette locks background scroll (html gets the
  15  |  *      command-palette-open class and overflow becomes hidden).
  16  |  *   5. Nav exposes a visible search-palette trigger so touch-only
  17  |  *      users can reach the command palette without the keyboard
  18  |  *      shortcut.
  19  |  *   6. Reduced-motion live toggle drops the tilt transform on every
  20  |  *      opted-in card in the next frame.
  21  |  *
  22  |  * Design notes:
  23  |  *
  24  |  * - We deliberately avoid `waitForLoadState('networkidle')` on the
  25  |  *   home route. The 3D lobby keeps a busy frame/resource pipeline,
  26  |  *   so networkidle is unreliable; `domcontentloaded` + a small
  27  |  *   settle buffer is sufficient for the palette bind-point.
  28  |  * - The palette-triggered tests use `/praxis/` instead of `/` so
  29  |  *   WebGL lobby canvas capture doesn't interfere with pointer
  30  |  *   input. Both pages host the same CommandPalette component via
  31  |  *   Base.astro.
  32  |  * - Each test is independent and resets with a fresh page.goto.
  33  |  */
  34  | 
  35  | const PALETTE_ROUTE = '/praxis/';
  36  | const SETTLE_MS = 300;
  37  | 
  38  | test('praxis empty-state clear restores every card', async ({ page }) => {
  39  |   await page.goto('/praxis/');
  40  |   const emptyState = page.locator('#praxis-empty-state');
  41  |   const cards = page.locator('[data-praxis-card]');
  42  |   const initial = await cards.count();
  43  |   test.skip(initial < 2, 'need at least two cards to exercise facets');
  44  | 
  45  |   /* Toggle every facet button so the intersection is guaranteed
  46  |      non-empty only under the "Clear filters" reset. Sticky filter
  47  |      selections would otherwise leak into the steady state. */
  48  |   const facetButtons = page.locator('.praxis__facet-btn');
  49  |   const facetCount = await facetButtons.count();
  50  |   for (let i = 0; i < facetCount; i += 1) {
  51  |     await facetButtons.nth(i).click();
  52  |   }
  53  | 
  54  |   /* One of two outcomes must hold: either every facet intersects
  55  |      (empty state hidden, but filters pressed) or the empty-state
  56  |      surface appears. In either case, "Clear filters" must bring
  57  |      every card back. */
  58  |   const hasEmpty = await emptyState.isVisible().catch(() => false);
  59  |   if (hasEmpty) {
  60  |     const clearBtn = emptyState.locator('[data-facet-clear]');
  61  |     await expect(clearBtn).toBeVisible();
  62  |     await clearBtn.click();
  63  |   } else {
  64  |     /* Click each pressed facet to un-press. */
  65  |     for (let i = 0; i < facetCount; i += 1) {
  66  |       const btn = facetButtons.nth(i);
  67  |       if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
  68  |     }
  69  |   }
  70  | 
  71  |   await expect(cards.first()).toBeVisible();
  72  |   const visible = page.locator('[data-praxis-card]:not([hidden])');
  73  |   await expect.poll(async () => visible.count()).toBe(initial);
  74  | });
  75  | 
  76  | test('praxis-ask error state renders retry button on index fetch failure', async ({ page }) => {
  77  |   /* Intercept the index request with a hard failure before the page
  78  |      loads so the assistant has no cached copy to fall back on. The
  79  |      assertion is on the user-visible retry affordance, not on the
  80  |      network layer — the goal is to prove the UI surfaces a
  81  |      recoverable state rather than a silent zero-results. */
  82  |   await page.route('**/search-index.json*', (route) => {
  83  |     return route.fulfill({ status: 503, body: 'unavailable' });
  84  |   });
  85  |   await page.goto('/praxis/');
  86  |   const input = page.locator('[data-praxis-ask-input]');
  87  |   /* PraxisAsk is corpus-size gated (see PRAXIS_ASK_MIN_CORPUS in
  88  |      src/pages/praxis.astro). Skip cleanly when the component is not
  89  |      rendered so the suite survives every corpus size up to the gate. */
  90  |   if ((await input.count()) === 0) {
  91  |     test.skip(true, 'praxis-ask gated off until corpus >= PRAXIS_ASK_MIN_CORPUS');
  92  |   }
  93  |   await expect(input).toBeVisible();
  94  |   await input.fill('anything');
  95  |   const retry = page.locator('[data-praxis-ask-retry], .praxis-ask__error-retry');
  96  |   await expect(retry).toBeVisible({ timeout: 5_000 });
  97  | });
  98  | 
  99  | test('command palette traps focus — tab cycles back inside palette', async ({ page, browserName }) => {
  100 |   await page.goto(PALETTE_ROUTE);
  101 |   await page.waitForLoadState('domcontentloaded');
  102 |   await page.waitForTimeout(SETTLE_MS);
  103 |   const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
  104 |   await page.keyboard.press(`${modifier}+KeyK`);
  105 |   const palette = page.locator('#command-palette');
  106 |   await expect(palette).toBeVisible();
  107 |   const input = page.locator('[data-command-palette-input]');
  108 |   await expect(input).toBeFocused();
  109 |   /* Tab once. Focus must land inside the palette (on a close button,
  110 |      a scrollable option row, etc.). Tab-from-input must not jump to
  111 |      the backgrounded document. */
> 112 |   await page.keyboard.press('Tab');
      |                       ^ Error: keyboard.press: Test timeout of 30000ms exceeded.
  113 |   const focusIsInsidePalette = await page.evaluate(() => {
  114 |     const root = document.getElementById('command-palette');
  115 |     return root ? root.contains(document.activeElement) : false;
  116 |   });
  117 |   expect(focusIsInsidePalette).toBe(true);
  118 |   await page.keyboard.press('Escape');
  119 |   await expect(palette).toBeHidden();
  120 | });
  121 | 
  122 | test('command palette locks background scroll while open', async ({ page, browserName }) => {
  123 |   await page.goto(PALETTE_ROUTE);
  124 |   await page.waitForLoadState('domcontentloaded');
  125 |   await page.waitForTimeout(SETTLE_MS);
  126 |   const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
  127 |   await page.keyboard.press(`${modifier}+KeyK`);
  128 |   const palette = page.locator('#command-palette');
  129 |   await expect(palette).toBeVisible();
  130 |   const state = await page.evaluate(() => ({
  131 |     overflow: window.getComputedStyle(document.documentElement).overflow,
  132 |     hasClass: document.documentElement.classList.contains('command-palette-open'),
  133 |   }));
  134 |   expect(state.hasClass).toBe(true);
  135 |   expect(state.overflow).toBe('hidden');
  136 |   await page.keyboard.press('Escape');
  137 |   const after = await page.evaluate(() =>
  138 |     document.documentElement.classList.contains('command-palette-open'),
  139 |   );
  140 |   expect(after).toBe(false);
  141 | });
  142 | 
  143 | test('nav exposes a visible command-palette trigger', async ({ page }) => {
  144 |   await page.goto(PALETTE_ROUTE);
  145 |   await page.waitForLoadState('domcontentloaded');
  146 |   await page.waitForTimeout(SETTLE_MS);
  147 |   const trigger = page.locator('[data-command-palette-trigger]').first();
  148 |   await expect(trigger).toBeVisible();
  149 |   /* Real pointer click contends with the lobby canvas on the home
  150 |      route; for this assertion we only care that the element carries
  151 |      the contract and the click handler opens the palette. Evaluating
  152 |      .click() in-page exercises the same delegated listener without
  153 |      pointer-event competition. */
  154 |   await trigger.evaluate((el) => {
  155 |     if (el instanceof HTMLElement) el.click();
  156 |   });
  157 |   const palette = page.locator('#command-palette');
  158 |   await expect(palette).toBeVisible();
  159 | });
  160 | 
  161 | test('reduced motion live toggle strips tilt transform', async ({ page }) => {
  162 |   await page.emulateMedia({ reducedMotion: 'no-preference' });
  163 |   await page.goto('/praxis/');
  164 |   await page.waitForLoadState('domcontentloaded');
  165 |   await page.waitForTimeout(SETTLE_MS);
  166 | 
  167 |   const tiltInner = page.locator('.tilt-inner').first();
  168 |   if ((await tiltInner.count()) === 0) test.skip(true, 'no tilt-inner targets on this route');
  169 | 
  170 |   const outer = page
  171 |     .locator('.lane, .preview-entry, .eng-carousel__slide, .praxis-card, .service-card-wrapper')
  172 |     .first();
  173 |   const outerBox = await outer.boundingBox();
  174 |   test.skip(!outerBox, 'outer card not laid out');
  175 |   if (!outerBox) return;
  176 |   /* Move the pointer over the card centre to wake the spring, then
  177 |      let a couple of frames settle. Flipping the motion preference
  178 |      afterwards asserts the live-subscribe path drains every tilt
  179 |      by the next rAF. */
  180 |   await page.mouse.move(outerBox.x + outerBox.width / 2, outerBox.y + outerBox.height / 2, {
  181 |     steps: 6,
  182 |   });
  183 |   await page.waitForTimeout(150);
  184 |   await page.emulateMedia({ reducedMotion: 'reduce' });
  185 |   await page.waitForTimeout(180);
  186 | 
  187 |   const transform = await tiltInner.evaluate((el) => {
  188 |     if (el instanceof HTMLElement) return el.style.transform || '';
  189 |     return '';
  190 |   });
  191 |   expect(transform).toBe('');
  192 | });
  193 | 
```