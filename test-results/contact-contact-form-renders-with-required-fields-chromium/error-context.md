# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: contact.spec.ts >> contact form renders with required fields
- Location: tests\e2e\contact.spec.ts:15:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('[name="name"]').first()
Expected: visible
Received: undefined

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for locator('[name="name"]').first()

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
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Contact form smoke (P7a/P7b): the form renders, required-field
  5  |  * client validation fires on empty submit, and the Turnstile container
  6  |  * is present (when the site-key env is configured).
  7  |  *
  8  |  * This test deliberately never clicks through to a real submission:
  9  |  *   - `/api/transmit` would insert into D1 and the rate-limit window
  10 |  *     would shift under parallel tests.
  11 |  *   - Turnstile cannot be solved headlessly in CI.
  12 |  * Those paths are covered by targeted unit/integration tests.
  13 |  */
  14 | 
  15 | test('contact form renders with required fields', async ({ page }) => {
  16 |   await page.goto('/contact/');
  17 |   await expect(page.locator('form[data-contact-form], form#contact-form')).toBeVisible();
  18 |   const requiredNames = ['name', 'email', 'message'];
  19 |   for (const name of requiredNames) {
  20 |     const field = page.locator(`[name="${name}"]`).first();
  21 |     if ((await field.count()) === 0) continue;
> 22 |     await expect(field).toBeVisible();
     |                         ^ Error: expect(locator).toBeVisible() failed
  23 |   }
  24 | });
  25 | 
  26 | test('submit without data is blocked by client validation', async ({ page }) => {
  27 |   await page.goto('/contact/');
  28 |   const form = page.locator('form').first();
  29 |   const submit = form.locator('[type="submit"]').first();
  30 |   if ((await submit.count()) === 0) test.skip(true, 'no submit button');
  31 |   let apiRequested = false;
  32 |   page.on('request', (req) => {
  33 |     if (req.url().includes('/api/transmit')) apiRequested = true;
  34 |   });
  35 |   await submit.click().catch(() => {
  36 |     /* Some browsers swallow the click when native validation popup opens. */
  37 |   });
  38 |   /* Required-field validation should have stopped the submission. */
  39 |   expect(apiRequested).toBe(false);
  40 | });
  41 | 
```