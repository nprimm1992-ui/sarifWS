# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nav-routes.spec.ts >> route / renders h1 + clean console
- Location: tests\e2e\nav-routes.spec.ts:32:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: console errors on /

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 5

- Array []
+ Array [
+   "Failed to load resource: the server responded with a status of 404 (Not Found)",
+   "Failed to load resource: the server responded with a status of 404 (Not Found)",
+   "Failed to load resource: the server responded with a status of 404 (Not Found)",
+ ]
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
  - generic [ref=e19]:
    - generic [ref=e20]:
      - generic [ref=e21]: STRATEGIC INTELLIGENCE
      - generic [ref=e22]: ◆
      - generic [ref=e23]: DIGITAL PRODUCTION
      - generic [ref=e24]: ◆
      - generic [ref=e25]: NARRATIVE ARCHITECTURE
      - generic [ref=e26]: ◆
      - generic [ref=e27]: MEDIA SYSTEMS
      - generic [ref=e28]: ◆
      - generic [ref=e29]: AI META-ORCHESTRATION
      - generic [ref=e30]: ◆
      - generic [ref=e31]: ARCHITECTURAL DEPTH
      - generic [ref=e32]: ◆
      - generic [ref=e33]: SPRINT SPEED
      - generic [ref=e34]: ◆
    - generic [ref=e35]:
      - generic [ref=e36]: STRATEGIC INTELLIGENCE
      - generic [ref=e37]: ◆
      - generic [ref=e38]: DIGITAL PRODUCTION
      - generic [ref=e39]: ◆
      - generic [ref=e40]: NARRATIVE ARCHITECTURE
      - generic [ref=e41]: ◆
      - generic [ref=e42]: MEDIA SYSTEMS
      - generic [ref=e43]: ◆
      - generic [ref=e44]: AI META-ORCHESTRATION
      - generic [ref=e45]: ◆
      - generic [ref=e46]: ARCHITECTURAL DEPTH
      - generic [ref=e47]: ◆
      - generic [ref=e48]: SPRINT SPEED
      - generic [ref=e49]: ◆
  - main [ref=e51]:
    - region "Sarif Consulting — AI-Augmented Strategic Consulting" [ref=e52]:
      - generic [ref=e53]:
        - heading "Sarif Consulting — Augment Your Intelligence" [level=1] [ref=e54]
        - link "Augment Your Intelligence" [ref=e56]:
          - /url: /services/
          - generic [ref=e57]: Augment Your Intelligence
    - region "Who we are, how we work — Augmented by design" [ref=e61]:
      - generic [ref=e64]:
        - link "Who we are, how we work — Augmented by design" [ref=e65]:
          - /url: /about/
        - generic [ref=e66]:
          - paragraph [ref=e67]:
            - text: Most firms sell
            - strong [ref=e68]: hours
            - text: and
            - strong [ref=e69]: discrete deliverables
            - text: . Sarif produces living systems where every surface maintains full coherence.
          - paragraph [ref=e70]: Strategy, systems architecture, experience design, ethics-grounded judgment and operational rigor remain interconnected within our AI-Augmented methodology.
  - contentinfo [ref=e71]:
    - generic [ref=e72]:
      - paragraph [ref=e73]:
        - generic [ref=e74]: © 2026 Sarif Consulting
        - generic [ref=e75]: ·
        - generic [ref=e76]: Portland, Oregon
      - generic [ref=e77]:
        - navigation "Footer navigation" [ref=e78]:
          - link "Lexicon" [ref=e79]:
            - /url: /lexicon/
          - generic [ref=e80]: ·
          - link "Privacy" [ref=e81]:
            - /url: /privacy/
          - generic [ref=e82]: ·
          - link "Terms" [ref=e83]:
            - /url: /terms/
          - generic [ref=e84]: ·
          - link "Accessibility" [ref=e85]:
            - /url: /accessibility/
        - group "Search and ambient audio" [ref=e86]:
          - button "Open search (Ctrl+K)" [ref=e87] [cursor=pointer]:
            - img [ref=e88]
            - generic [ref=e91]: ⌘K
          - button "Toggle ambient audio" [ref=e92] [cursor=pointer]:
            - generic [ref=e97]: "OFF"
            - generic [ref=e98]: "Ambient audio:"
    - region "Cookie and infrastructure notice" [ref=e99]:
      - generic [ref=e100]:
        - paragraph [ref=e101]:
          - text: Strictly necessary cookies only — no third-party advertising or behavioural tracking.
          - link "Details" [ref=e102]:
            - /url: /privacy#cookies
          - text: .
        - button "Dismiss" [ref=e103] [cursor=pointer]
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
  1  | import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Nav route smoke: every primary route renders an <h1>, responds 200,
  5  |  * and produces no console errors (warnings are tolerated because the
  6  |  * 3D lobby logs shader-compile diagnostics on GL-limited runners).
  7  |  */
  8  | 
  9  | const ROUTES: Array<{ path: string; title: RegExp }> = [
  10 |   { path: '/', title: /sarif/i },
  11 |   { path: '/about/', title: /about|sarif/i },
  12 |   { path: '/services/', title: /services|sarif/i },
  13 |   { path: '/engagements/', title: /engagements|sarif/i },
  14 |   { path: '/lexicon/', title: /lexicon|sarif/i },
  15 |   { path: '/praxis/', title: /praxis|sarif/i },
  16 |   { path: '/contact/', title: /contact|sarif/i },
  17 |   { path: '/privacy/', title: /privacy|sarif/i },
  18 | ];
  19 | 
  20 | async function attachConsoleCollector(page: Page) {
  21 |   const errors: string[] = [];
  22 |   const onMsg = (msg: ConsoleMessage) => {
  23 |     if (msg.type() === 'error') errors.push(msg.text());
  24 |   };
  25 |   const onPageError = (err: Error) => errors.push(err.message);
  26 |   page.on('console', onMsg);
  27 |   page.on('pageerror', onPageError);
  28 |   return { errors };
  29 | }
  30 | 
  31 | for (const { path, title } of ROUTES) {
  32 |   test(`route ${path} renders h1 + clean console`, async ({ page }) => {
  33 |     const { errors } = await attachConsoleCollector(page);
  34 |     const resp = await page.goto(path, { waitUntil: 'domcontentloaded' });
  35 |     expect(resp?.status(), `status for ${path}`).toBeLessThan(400);
  36 |     await expect(page).toHaveTitle(title);
  37 |     const h1 = page.locator('h1');
  38 |     await expect(h1.first()).toBeVisible();
  39 |     /* Allow React DevTools / CSP noise, fail on real app errors. */
  40 |     const realErrors = errors.filter(
  41 |       (e) =>
  42 |         !/DevTools/i.test(e) &&
  43 |         !/Refused to load.*chrome-extension/i.test(e) &&
  44 |         !/chrome-extension:/i.test(e),
  45 |     );
> 46 |     expect(realErrors, `console errors on ${path}`).toEqual([]);
     |                                                     ^ Error: console errors on /
  47 |   });
  48 | }
  49 | 
  50 | test('skip link is present and focusable on home', async ({ page }) => {
  51 |   await page.goto('/');
  52 |   const skipLink = page.locator('a[href="#main"], a[href="#content"]').first();
  53 |   if ((await skipLink.count()) === 0) test.skip(true, 'no skip link defined');
  54 |   await skipLink.focus();
  55 |   await expect(skipLink).toBeFocused();
  56 | });
  57 | 
```