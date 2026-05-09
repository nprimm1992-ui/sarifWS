# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: praxis.spec.ts >> praxis facets hide non-matching cards
- Location: tests\e2e\praxis.spec.ts:26:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
TimeoutError: locator.click: Timeout 6000ms exceeded.
Call log:
  - waiting for locator('.praxis__facet-btn').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
  - dialog:
    - button
    - document:
      - banner:
        - generic:
          - generic:
            - generic: ❯
            - generic: NAVIGATE · SARIF
          - generic:
            - generic: ⌘
            - generic: K
        - heading [level=2]: Command
        - paragraph:
          - text: Search Praxis, Lexicon, Engagements, and pages. Press
          - generic: /
          - text: anywhere to reopen.
      - generic:
        - img
        - combobox
        - generic: ESC
      - toolbar:
        - button [pressed]:
          - generic: ◆
          - generic: All
        - button:
          - generic: P
          - generic: Praxis
        - button:
          - generic: L
          - generic: Lexicon
        - button:
          - generic: E
          - generic: Engagements
        - button:
          - generic: §
          - generic: Pages
      - contentinfo:
        - generic:
          - generic: ↑
          - generic: ↓
          - generic: navigate
        - generic:
          - generic: ⏎
          - generic: open
        - generic:
          - generic: ⌘
          - generic: ⏎
          - generic: new tab
        - generic:
          - generic: tab
          - generic: scope
        - generic:
          - generic: esc
          - generic: close
  - status
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Praxis smoke: list renders, facets toggle, the RAG-lite assistant
  5  |  * returns results, and article navigation survives view transitions.
  6  |  */
  7  | 
  8  | test('praxis index lists published articles', async ({ page }) => {
  9  |   await page.goto('/praxis/');
  10 |   const cards = page.locator('[data-praxis-card]');
  11 |   await expect(cards.first()).toBeVisible();
  12 |   const count = await cards.count();
  13 |   expect(count).toBeGreaterThanOrEqual(1);
  14 | });
  15 | 
  16 | test('clicking a praxis card navigates to the article', async ({ page }) => {
  17 |   await page.goto('/praxis/');
  18 |   const firstCard = page.locator('[data-praxis-card] a.praxis-card__link').first();
  19 |   const href = await firstCard.getAttribute('href');
  20 |   expect(href, 'card should have href').toMatch(/^\/praxis\//);
  21 |   await firstCard.click();
  22 |   await page.waitForURL(/\/praxis\/[^/]+\/$/);
  23 |   await expect(page.locator('h1')).toBeVisible();
  24 | });
  25 | 
  26 | test('praxis facets hide non-matching cards', async ({ page }) => {
  27 |   await page.goto('/praxis/');
  28 |   const facetBtn = page.locator('.praxis__facet-btn').first();
  29 |   if ((await facetBtn.count()) === 0) test.skip(true, 'no facet buttons rendered');
  30 |   const label = (await facetBtn.textContent())?.trim() ?? '';
  31 |   expect(label.length).toBeGreaterThan(0);
> 32 |   await facetBtn.click();
     |                  ^ TimeoutError: locator.click: Timeout 6000ms exceeded.
  33 |   await expect(facetBtn).toHaveAttribute('aria-pressed', 'true');
  34 |   /* At least one card must remain visible — the facet itself was
  35 |      derived from published content so the intersection is non-empty. */
  36 |   const visibleCards = page.locator('[data-praxis-card]:not([hidden])');
  37 |   await expect(visibleCards.first()).toBeVisible();
  38 | });
  39 | 
  40 | test('praxis-ask surfaces inline results and logs on navigation', async ({ page }) => {
  41 |   await page.goto('/praxis/');
  42 |   const input = page.locator('[data-praxis-ask-input]');
  43 |   /* PraxisAsk is corpus-size gated (see PRAXIS_ASK_MIN_CORPUS in
  44 |      src/pages/praxis.astro). Below the threshold the component does
  45 |      not render; skip rather than fail so the suite stays green on
  46 |      every published-count between 0 and the gate. */
  47 |   if ((await input.count()) === 0) {
  48 |     test.skip(true, 'praxis-ask gated off until corpus >= PRAXIS_ASK_MIN_CORPUS');
  49 |   }
  50 |   const results = page.locator('[data-praxis-ask-results]');
  51 |   await expect(input).toBeVisible();
  52 |   /* Capture the /api/ask beacon so we can assert we log, without
  53 |      asserting on the response (204 by design). */
  54 |   const logPromise = page.waitForRequest(
  55 |     (req) => req.url().endsWith('/api/ask') && req.method() === 'POST',
  56 |     { timeout: 5_000 },
  57 |   ).catch(() => null);
  58 |   await input.fill('coherence');
  59 |   await expect(results).toBeVisible();
  60 |   const options = results.locator('[role="option"]');
  61 |   const optionCount = await options.count();
  62 |   expect(optionCount).toBeGreaterThan(0);
  63 |   await logPromise;
  64 | });
  65 | 
```