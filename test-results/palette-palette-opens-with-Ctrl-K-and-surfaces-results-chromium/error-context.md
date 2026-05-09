# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: palette.spec.ts >> palette opens with Ctrl+K and surfaces results
- Location: tests\e2e\palette.spec.ts:8:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#command-palette')
Expected: visible
Received: undefined

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for locator('#command-palette')

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Command palette smoke (P9a): Cmd+K (or Ctrl+K on Linux) opens the
  5  |  * palette, typing narrows the result set, Escape closes.
  6  |  */
  7  | 
  8  | test('palette opens with Ctrl+K and surfaces results', async ({ page, browserName }) => {
  9  |   await page.goto('/');
  10 |   /* Wait past the initial lobby boot so the key handler is bound. */
  11 |   await page.waitForLoadState('networkidle');
  12 |   const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
  13 |   await page.keyboard.press(`${modifier}+KeyK`);
  14 |   const palette = page.locator('#command-palette');
> 15 |   await expect(palette).toBeVisible();
     |                         ^ Error: expect(locator).toBeVisible() failed
  16 |   const input = page.locator('[data-command-palette-input]');
  17 |   await input.fill('contact');
  18 |   const results = page.locator('[data-command-palette-results] [role="option"]');
  19 |   await expect(results.first()).toBeVisible({ timeout: 5_000 });
  20 |   await page.keyboard.press('Escape');
  21 |   await expect(palette).toBeHidden();
  22 | });
  23 | 
```