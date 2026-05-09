# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nav-routes.spec.ts >> route /services/ renders h1 + clean console
- Location: tests\e2e\nav-routes.spec.ts:32:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: console errors on /services/

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
  - main [ref=e19]:
    - region "Augmented Services" [ref=e20]:
      - generic [ref=e21]:
        - paragraph [ref=e22]: Choose Your Augment
        - heading "Augmented Services" [level=1] [ref=e23]
      - paragraph [ref=e25]:
        - generic [ref=e26]: Four practice areas. One methodology.
        - text: Every engagement is produced through the same AI meta-orchestration framework. The output type changes. The architectural depth does not.
    - region "Service details" [ref=e27]:
      - generic [ref=e29]:
        - group [ref=e30]:
          - generic "Strategic Intelligence Complete strategic architectures for organizations at every level." [ref=e31]:
            - generic [ref=e32]:
              - heading "Strategic Intelligence" [level=2] [ref=e33]
              - paragraph [ref=e34]: Complete strategic architectures for organizations at every level.
            - img [ref=e36]
        - group [ref=e37]:
          - generic "Digital Production Engineered digital environments and interactive experiences." [ref=e38]:
            - generic [ref=e39]:
              - heading "Digital Production" [level=2] [ref=e40]
              - paragraph [ref=e41]: Engineered digital environments and interactive experiences.
            - img [ref=e43]
        - group [ref=e44]:
          - generic "Narrative & Positioning Materials that reframe perception for the people who decide." [ref=e45]:
            - generic [ref=e46]:
              - heading "Narrative & Positioning" [level=2] [ref=e47]
              - paragraph [ref=e48]: Materials that reframe perception for the people who decide.
            - img [ref=e50]
        - group [ref=e51]:
          - generic "Content & Media Production-grade content built to compound." [ref=e52]:
            - generic [ref=e53]:
              - heading "Content & Media" [level=2] [ref=e54]
              - paragraph [ref=e55]: Production-grade content built to compound.
            - img [ref=e57]
  - generic [ref=e60]:
    - generic [ref=e61]:
      - generic [ref=e62]: POLICY INFRASTRUCTURE
      - generic [ref=e63]: ◆
      - generic [ref=e64]: CIVIC CAMPAIGN STRATEGY
      - generic [ref=e65]: ◆
      - generic [ref=e66]: VENTURE CAPITAL MATERIALS
      - generic [ref=e67]: ◆
      - generic [ref=e68]: BUSINESS TRANSFORMATION ARCHITECTURE
      - generic [ref=e69]: ◆
      - generic [ref=e70]: INSTITUTIONAL TURNAROUND STRATEGY
      - generic [ref=e71]: ◆
      - generic [ref=e72]: DIGITAL PLATFORM & SPATIAL DESIGN
      - generic [ref=e73]: ◆
      - generic [ref=e74]: $106M DEPLOYMENT MATRIX
      - generic [ref=e75]: ◆
      - generic [ref=e76]: 6 SECTORS
      - generic [ref=e77]: ◆
      - generic [ref=e78]: 47+ DOCUMENTS DELIVERED
      - generic [ref=e79]: ◆
    - generic [ref=e80]:
      - generic [ref=e81]: POLICY INFRASTRUCTURE
      - generic [ref=e82]: ◆
      - generic [ref=e83]: CIVIC CAMPAIGN STRATEGY
      - generic [ref=e84]: ◆
      - generic [ref=e85]: VENTURE CAPITAL MATERIALS
      - generic [ref=e86]: ◆
      - generic [ref=e87]: BUSINESS TRANSFORMATION ARCHITECTURE
      - generic [ref=e88]: ◆
      - generic [ref=e89]: INSTITUTIONAL TURNAROUND STRATEGY
      - generic [ref=e90]: ◆
      - generic [ref=e91]: DIGITAL PLATFORM & SPATIAL DESIGN
      - generic [ref=e92]: ◆
      - generic [ref=e93]: $106M DEPLOYMENT MATRIX
      - generic [ref=e94]: ◆
      - generic [ref=e95]: 6 SECTORS
      - generic [ref=e96]: ◆
      - generic [ref=e97]: 47+ DOCUMENTS DELIVERED
      - generic [ref=e98]: ◆
  - contentinfo [ref=e99]:
    - generic [ref=e100]:
      - paragraph [ref=e101]:
        - generic [ref=e102]: © 2026 Sarif Consulting
        - generic [ref=e103]: ·
        - generic [ref=e104]: Portland, Oregon
      - generic [ref=e105]:
        - navigation "Footer navigation" [ref=e106]:
          - link "Lexicon" [ref=e107]:
            - /url: /lexicon/
          - generic [ref=e108]: ·
          - link "Privacy" [ref=e109]:
            - /url: /privacy/
          - generic [ref=e110]: ·
          - link "Terms" [ref=e111]:
            - /url: /terms/
          - generic [ref=e112]: ·
          - link "Accessibility" [ref=e113]:
            - /url: /accessibility/
        - group "Search and ambient audio" [ref=e114]:
          - button "Open search (Ctrl+K)" [ref=e115] [cursor=pointer]:
            - img [ref=e116]
            - generic [ref=e119]: ⌘K
          - button "Toggle ambient audio" [ref=e120] [cursor=pointer]:
            - generic [ref=e125]: "OFF"
            - generic [ref=e126]: "Ambient audio:"
    - region "Cookie and infrastructure notice" [ref=e127]:
      - generic [ref=e128]:
        - paragraph [ref=e129]:
          - text: Strictly necessary cookies only — no third-party advertising or behavioural tracking.
          - link "Details" [ref=e130]:
            - /url: /privacy#cookies
          - text: .
        - button "Dismiss" [ref=e131] [cursor=pointer]
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
     |                                                     ^ Error: console errors on /services/
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