import { expect, test } from '@playwright/test';

/**
 * Public Jensen panel. The preview server has no Pages Functions, so the
 * session, turn, and transmit calls are intercepted. Assertions are about
 * what a visitor can see and do.
 */

const CAPABILITIES = {
  streaming: true,
  sources: true,
  scope: true,
  prebrief: true,
  memory_turns: 3,
};

function sse(events: Array<[string, unknown]>) {
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

const ANSWER = 'A **diagnostic** is the first step.\n\n- It starts with the published pages [1].';

function answerEvents(extra: Array<[string, unknown]> = []) {
  return sse([
    ['turn_start', { session_id: 'sess-e2e', turn_id: 't1' }],
    ['phase', { name: 'retrieving' }],
    ['sources', {
      items: [{
        n: 1,
        url: '/services/',
        title: 'Services',
        section: 'services',
        excerpt: 'A diagnostic is the first engagement for a defined question.',
      }],
    }],
    ...extra,
    ['phase', { name: 'composing' }],
    ['delta', { content: ANSWER }],
    ['turn_end', { usage: { output_tokens: 20 }, cited: [1] }],
  ]);
}

async function installSession(page: import('@playwright/test').Page, status = 201) {
  await page.route('**/api/jensen/session', async (route) => {
    if (status !== 201) {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ status, code: 'public_disabled', title: 'Public Jensen is switched off' }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        session_id: 'sess-e2e',
        protocol: 'jensen.public.v1',
        capabilities: CAPABILITIES,
      }),
    });
  });
}

async function installTurns(page: import('@playwright/test').Page, body: string) {
  await page.route('**/api/jensen/turns', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    });
  });
}

async function openPanel(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('#jensen-launcher').click();
  await expect(page.locator('#jensen-panel')).toBeVisible();
}

test('the launcher is a real link to contact before it is enhanced', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#jensen-launcher')).toHaveAttribute('href', '/contact/');
});

test('a turn streams markdown, a citation, and a source card', async ({ page }) => {
  await installSession(page);
  await installTurns(page, answerEvents());
  await openPanel(page);
  await page.locator('#jensen-input').fill('What does a diagnostic include?');
  await page.locator('#jensen-send').click();
  await expect(page.getByRole('button', { name: 'Source 1: Services' })).toBeVisible();
  await expect(page.locator('.jensen-answer strong')).toHaveText('diagnostic');
  await expect(page.locator('.jensen-source-title')).toHaveText('Services');
  await expect(page.getByRole('link', { name: 'Open page' })).toHaveAttribute('href', /\/services\/?$/);
});

test('a scope card shows the published floor and no cart language', async ({ page }) => {
  await installSession(page);
  await installTurns(page, answerEvents([
    ['scope', {
      available: true,
      count: 1,
      floor: 1500,
      quote_count: 0,
      brief: 'Requested scope\nEstimated floor: $1,500',
      items: [{ title: 'Strategic Diagnostic', kind: 'from', from: 1500 }],
    }],
  ]));
  await openPanel(page);
  await page.locator('#jensen-input').fill('How are fees structured?');
  await page.locator('#jensen-send').click();
  const panel = page.locator('#jensen-panel');
  await expect(panel.locator('.jensen-floor')).toHaveText('From $1,500. A floor, not an invoice.');
  await expect(panel).toContainText('Strategic Diagnostic');
  const text = (await panel.innerText()).toLowerCase();
  for (const banned of ['add to cart', 'checkout', 'subtotal', 'buy now']) {
    expect(text, banned).not.toContain(banned);
  }
});

test('the same thread survives navigation', async ({ page }) => {
  await installSession(page);
  await installTurns(page, answerEvents());
  await openPanel(page);
  await page.locator('#jensen-input').fill('What does Sarif actually do?');
  await page.locator('#jensen-send').click();
  await expect(page.locator('.jensen-answer strong')).toHaveText('diagnostic');
  await page.locator('.nav-links a[href="/services/"]').click();
  await expect(page).toHaveURL(/\/services\/?$/);
  await page.locator('.nav-links a[href="/praxis/"]').click();
  await expect(page).toHaveURL(/\/praxis\/?$/);
  await expect(page.locator('#jensen-panel')).toBeVisible();
  await expect(page.getByText('What does Sarif actually do?')).toBeVisible();
  await expect(page.locator('.jensen-answer strong')).toHaveText('diagnostic');
});

test('offline opens the brief instead of a dead composer', async ({ page }) => {
  await installSession(page, 503);
  await openPanel(page);
  await expect(page.locator('#jensen-alert')).toContainText('offline');
  await expect(page.locator('#jensen-sheet')).toBeVisible();
});

test('a session limit offers a new thread', async ({ page }) => {
  await installSession(page);
  await installTurns(page, sse([
    ['turn_start', { session_id: 'sess-e2e', turn_id: 't1' }],
    ['problem', { status: 429, code: 'session_limit', title: 'This public session has ended' }],
  ]));
  await openPanel(page);
  await page.locator('#jensen-input').fill('One more question please');
  await page.locator('#jensen-send').click();
  await expect(page.locator('#jensen-alert')).toContainText('reached its limit');
  await expect(page.locator('#jensen-alert').getByRole('button', { name: 'Start a new thread' })).toBeVisible();
});

test('stop keeps the partial turn and marks it stopped', async ({ page }) => {
  await installSession(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/jensen/turns', async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: answerEvents() }).catch(() => {});
  });
  await openPanel(page);
  await page.locator('#jensen-input').fill('Please hold this question');
  await page.locator('#jensen-send').click();
  await expect(page.locator('#jensen-send')).toHaveText('Stop');
  await page.locator('#jensen-send').click();
  await expect(page.locator('.jensen-stopped')).toHaveText('Stopped');
  release();
});

test('a dropped connection puts the question back in the box', async ({ page }) => {
  await installSession(page);
  await page.route('**/api/jensen/turns', (route) => route.abort('failed'));
  await openPanel(page);
  await page.locator('#jensen-input').fill('This connection will fail now');
  await page.locator('#jensen-send').click();
  await expect(page.locator('#jensen-input')).toHaveValue('This connection will fail now');
  await expect(page.locator('#jensen-alert')).toContainText('connection stopped');
});

test('Brief Nicholas shows the brief and posts that text', async ({ page }) => {
  await installSession(page);
  await installTurns(page, answerEvents());
  await openPanel(page);
  await page.locator('#jensen-input').fill('What does a diagnostic include?');
  await page.locator('#jensen-send').click();
  await expect(page.locator('.jensen-answer strong')).toBeVisible();
  await page.locator('#jensen-brief').click();
  const brief = page.locator('#jensen-brief-text');
  await expect(brief).toBeVisible();
  await expect(brief).toHaveValue(/What does a diagnostic include\?/);
  await brief.fill('Please look at a diagnostic for a team of twenty people.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#jensen-name').fill('Ada Operator');
  await page.locator('#jensen-email').fill('ada@example.com');
  let posted: string | null = null;
  await page.route('**/api/transmit', async (route) => {
    posted = route.request().postData();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.locator('#jensen-sheet button[type="submit"]').click();
  await expect.poll(() => posted).not.toBeNull();
  const body = JSON.parse(String(posted)) as { signal?: string; name?: string; email?: string };
  expect(body.signal).toContain('team of twenty');
  expect(body.name).toBe('Ada Operator');
  expect(body.email).toBe('ada@example.com');
  await expect(page.locator('.jensen-sent')).toContainText('Nicholas reads this himself');
});

test('Escape closes the panel and returns focus to the launcher', async ({ page }) => {
  await installSession(page);
  await openPanel(page);
  await page.locator('#jensen-input').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#jensen-panel')).toBeHidden();
  await expect(page.locator('#jensen-launcher')).toBeFocused();
});

test('Escape closes the brief before the panel and focus returns to Brief Nicholas', async ({ page }) => {
  await installSession(page);
  await openPanel(page);
  await page.locator('#jensen-brief').click();
  await expect(page.locator('#jensen-sheet')).toBeVisible();
  expect(await page.locator('#jensen-form').evaluate((node) => (node as HTMLElement).inert)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#jensen-sheet')).toBeHidden();
  await expect(page.locator('#jensen-panel')).toBeVisible();
  await expect(page.locator('#jensen-brief')).toBeFocused();
  await page.locator('#jensen-brief').click();
  await page.getByTestId('jensen-brief-close').click();
  await expect(page.locator('#jensen-sheet')).toBeHidden();
  expect(await page.locator('#jensen-form').evaluate((node) => (node as HTMLElement).inert)).toBe(false);
});

test('a failed answer offers one Try again, and retrying replaces the failed turn', async ({ page }) => {
  await installSession(page);
  let calls = 0;
  await page.route('**/api/jensen/turns', async (route) => {
    calls += 1;
    const body = calls === 1
      ? sse([
        ['turn_start', { session_id: 'sess-e2e', turn_id: 't1' }],
        ['problem', { status: 502, code: 'model', title: 'The model stopped' }],
      ])
      : answerEvents();
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });
  await openPanel(page);
  await page.locator('#jensen-input').fill('What does a diagnostic include?');
  await page.locator('#jensen-send').click();
  await expect(page.locator('#jensen-alert')).toContainText('stopped before it was finished');
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Copy answer' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.jensen-answer strong')).toHaveText('diagnostic');
  await expect(page.locator('.jensen-turn')).toHaveCount(1);
  await expect(page.locator('#jensen-alert')).toBeHidden();
});

test('a second turn leaves the first turn in place for screen readers', async ({ page }) => {
  await installSession(page);
  await installTurns(page, answerEvents());
  await openPanel(page);
  await page.locator('#jensen-input').fill('What does a diagnostic include?');
  await page.locator('#jensen-send').click();
  await expect(page.locator('.jensen-turn')).toHaveCount(1);
  await expect(page.locator('.jensen-answer strong')).toHaveText('diagnostic');
  await page.locator('.jensen-turn').first().evaluate((node) => { node.setAttribute('data-probe', 'kept'); });
  await page.locator('#jensen-input').fill('And after the diagnostic?');
  await page.locator('#jensen-send').click();
  await expect(page.locator('.jensen-turn')).toHaveCount(2);
  await expect(page.locator('.jensen-turn').nth(1).locator('.jensen-answer strong')).toHaveText('diagnostic');
  await expect(page.locator('.jensen-turn').first()).toHaveAttribute('data-probe', 'kept');
});

test('Tab from the question lands on Send', async ({ page }) => {
  await installSession(page);
  await openPanel(page);
  await page.locator('#jensen-input').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#jensen-send')).toBeFocused();
});

test('the mobile sheet keeps the composer inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await installSession(page);
  await openPanel(page);
  const box = await page.locator('#jensen-input').boundingBox();
  expect(box).not.toBeNull();
  if (box) expect(box.y + box.height).toBeLessThanOrEqual(700);
  const panel = await page.locator('#jensen-panel').boundingBox();
  expect(panel?.height ?? 0).toBeGreaterThan(600);
  await expect(page.locator('#jensen-title')).toBeFocused();
  await expect(page.locator('#jensen-input')).not.toBeFocused();
});

test('reduced motion sets data-motion and does not run the panel animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installSession(page);
  await openPanel(page);
  await expect(page.locator('#jensen-panel')).toHaveAttribute('data-motion', 'reduced');
  const animation = await page.locator('#jensen-panel').evaluate((node) => getComputedStyle(node).animationName);
  expect(animation === 'none' || animation === '').toBe(true);
});
