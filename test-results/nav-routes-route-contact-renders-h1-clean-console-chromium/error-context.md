# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nav-routes.spec.ts >> route /contact/ renders h1 + clean console
- Location: tests\e2e\nav-routes.spec.ts:32:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: console errors on /contact/

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
    - region "Establish Contact" [ref=e20]:
      - generic [ref=e21]:
        - paragraph [ref=e22]: Augment Your Intelligence
        - heading "Establish Contact" [level=1] [ref=e23]
    - region "Contact form" [ref=e24]:
      - generic [ref=e26]:
        - generic [ref=e27]:
          - generic [ref=e28]: Website
          - textbox [ref=e29]
          - generic [ref=e31]:
            - generic [ref=e32]:
              - generic [ref=e33]:
                - generic [ref=e34]: TX-
                - generic [ref=e35]: 2026-05
                - generic [ref=e36]: ·
                - generic [ref=e39]: Channel open · Sarif connected
              - generic [ref=e40]:
                - generic [ref=e41]: "0"
                - generic [ref=e42]: /
                - generic [ref=e43]: 10,000
                - generic [ref=e46]: 20 min
            - generic [ref=e47]: Contact us
            - textbox "Contact us" [ref=e48]:
              - /placeholder: ▸ What are you facing? Enough context for a clean read — at least 20 characters.
            - paragraph
          - generic [ref=e50]:
            - generic [ref=e51]: Name
            - textbox "Name" [ref=e52]
          - generic [ref=e53]:
            - generic [ref=e54]: Email
            - textbox "Email" [ref=e55]
          - generic [ref=e56]:
            - generic [ref=e57]: Organization (optional)
            - textbox "Organization (optional)" [ref=e58]
          - button "Transmit signal" [ref=e60]:
            - generic [ref=e61]: Transmit
        - complementary "Contact information" [ref=e62]:
          - generic [ref=e63]:
            - heading "Direct" [level=2] [ref=e64]
            - link "info@sarifconsulting.ai" [ref=e65]:
              - /url: mailto:info@sarifconsulting.ai
          - generic [ref=e66]:
            - heading "Location" [level=2] [ref=e67]
            - paragraph [ref=e68]: Portland, Oregon
          - paragraph [ref=e70]: All communications are treated as confidential. Project details are never shared or referenced publicly without explicit authorization.
          - paragraph [ref=e71]:
            - text: Your transmission is stored for 90 days unless we engage, encrypted at rest, and never used to train external models. See
            - link "Privacy" [ref=e72]:
              - /url: /privacy#retention
            - text: .
  - contentinfo [ref=e73]:
    - generic [ref=e74]:
      - paragraph [ref=e75]:
        - generic [ref=e76]: © 2026 Sarif Consulting
        - generic [ref=e77]: ·
        - generic [ref=e78]: Portland, Oregon
      - generic [ref=e79]:
        - navigation "Footer navigation" [ref=e80]:
          - link "Lexicon" [ref=e81]:
            - /url: /lexicon/
          - generic [ref=e82]: ·
          - link "Privacy" [ref=e83]:
            - /url: /privacy/
          - generic [ref=e84]: ·
          - link "Terms" [ref=e85]:
            - /url: /terms/
          - generic [ref=e86]: ·
          - link "Accessibility" [ref=e87]:
            - /url: /accessibility/
        - group "Search and ambient audio" [ref=e88]:
          - button "Open search (Ctrl+K)" [ref=e89] [cursor=pointer]:
            - img [ref=e90]
            - generic [ref=e93]: ⌘K
          - button "Toggle ambient audio" [ref=e94] [cursor=pointer]:
            - generic [ref=e99]: "OFF"
            - generic [ref=e100]: "Ambient audio:"
    - region "Cookie and infrastructure notice" [ref=e101]:
      - generic [ref=e102]:
        - paragraph [ref=e103]:
          - text: Strictly necessary cookies only — no third-party advertising or behavioural tracking.
          - link "Details" [ref=e104]:
            - /url: /privacy#cookies
          - text: .
        - button "Dismiss" [ref=e105] [cursor=pointer]
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
     |                                                     ^ Error: console errors on /contact/
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