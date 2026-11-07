import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldRender,
  onRendered,
  setFloorFps,
  resetRenderBudget,
  setRenderPacingMs,
} from '../../src/scripts/lobby-render-budget.js';

test('shouldRender respects floor interval at 60 fps', () => {
  resetRenderBudget();
  setFloorFps(60);
  assert.equal(shouldRender(), true);
  onRendered();
  assert.equal(shouldRender(), false);
});

test('render pacing blocks draws until interval elapses', async () => {
  resetRenderBudget();
  setFloorFps(120);
  setRenderPacingMs(30);
  assert.equal(shouldRender(), true);
  onRendered();
  assert.equal(shouldRender(), false);
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(shouldRender(), true);
});
