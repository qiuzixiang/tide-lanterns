import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, VOYAGES } from '../src/campaign.mjs';
import { createGame, applyAction } from '../src/engine.mjs';
import {
  SAVE_KEY, freshSave, replay, validateCurrent, sanitizeSave,
  readSave, writeSave, claimCompletion, campaignCount, chapterCount, nextCampaign,
} from '../src/storage.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function solveByRotations(level) {
  let game = createGame(level);
  const actions = [];
  for (let index = 0; index < level.total; index++) {
    let attempts = 0;
    while (game.orientations[index] !== level.solution[index]) {
      assert.ok(attempts++ < 3);
      const action = { type: 'rotate', index, turns: 1 };
      const result = applyAction(game, action);
      assert.equal(result.accepted, true);
      actions.push(action); game = result.state;
    }
  }
  assert.equal(game.status, 'won');
  return { game, actions };
}
function current(level = LEVELS[0], extra = {}) {
  return { levelId: level.id, actions: [], cursor: 0, hints: 0, elapsed: 0, mode: 'campaign', date: '', ...extra };
}

test('fresh saves have isolated mutable settings and claims', () => {
  const a = freshSave(), b = freshSave();
  a.settings.sound = true; a.claims.extra = true;
  assert.equal(b.settings.sound, false); assert.deepEqual(b.claims, {});
  assert.equal(SAVE_KEY, 'tide-lanterns:v1');
});

test('current restoration replays actual rotations and lock state at the selected cursor', () => {
  const level = LEVELS[0];
  const first = Array.from({ length: level.total }, (_, index) => ({ type: 'rotate', index, turns: 1 }))
    .find(action => { const r = applyAction(createGame(level), action); return r.accepted && r.state.status !== 'won'; });
  assert.ok(first);
  const actions = [first, { type: 'toggle-lock', index: first.index }, { type: 'toggle-lock', index: first.index }];
  const restored = validateCurrent(current(level, { actions, cursor: 2, hints: 3, elapsed: 29 }));
  assert.ok(restored);
  const game = replay(level, restored.actions, restored.cursor);
  assert.equal(game.moves, 1); assert.equal(game.locked[first.index], true);
  assert.equal(restored.hints, 3); assert.equal(restored.elapsed, 29);
  assert.equal(restored.actions.length, 3, 'valid redo tail is preserved');
  assert.equal(replay(level, restored.actions).locked[first.index], false);
});

test('restoration ignores forged board, status and completion booleans', () => {
  const level = LEVELS[0];
  const restored = validateCurrent(current(level, {
    status: 'won', completed: true, orientations: [...level.solution], moves: 0,
  }));
  assert.ok(restored);
  const game = replay(level, restored.actions, restored.cursor);
  assert.equal(game.status, 'playing'); assert.deepEqual(game.orientations, level.initial);
  assert.equal('completed' in restored, false); assert.equal('orientations' in restored, false);
});

test('invalid action logs and invalid redo tails cannot restore', () => {
  const invalid = [null, {}, [{ type: 'rotate', index: -1, turns: 1 }], [{ type: 'rotate', index: 0, turns: 2 }],
    [{ type: 'teleport', index: 0 }], [{ type: 'rotate', index: 1000, turns: 1 }],
    [{ type: 'toggle-lock', index: 0 }, { type: 'rotate', index: 0, turns: 1 }]];
  for (const actions of invalid) assert.equal(validateCurrent(current(LEVELS[0], { actions, cursor: 0 })), null);
  assert.equal(validateCurrent(current(LEVELS[0], { cursor: 1 })), null);
  assert.equal(validateCurrent(current(LEVELS[0], { actions: Array(4001).fill({ type: 'toggle-lock', index: 0 }) })), null);
});

test('invalid identity, hints, elapsed and cursors are rejected without throwing', () => {
  for (const extra of [{ levelId: 'foreign' }, { hints: -1 }, { hints: 4001 }, { hints: NaN },
    { elapsed: -1 }, { elapsed: 31536001 }, { cursor: -1 }, { cursor: .5 }, { cursor: '0' }]) {
    assert.equal(validateCurrent(current(LEVELS[0], extra)), null);
  }
  assert.equal(validateCurrent(null), null);
  assert.deepEqual(sanitizeSave({ version: 99, claims: { fake: true } }), freshSave());
});

test('solved action logs restore a real win and cannot rotate after completion', () => {
  const { game, actions } = solveByRotations(LEVELS[0]);
  const restored = validateCurrent(current(LEVELS[0], { actions, cursor: actions.length, hints: 2 }));
  assert.equal(replay(game.level, restored.actions).status, 'won');
  assert.equal(restored.hints, 2);
  const invalid = actions.concat({ type: 'rotate', index: 0, turns: 1 });
  assert.equal(validateCurrent(current(LEVELS[0], { actions: invalid, cursor: actions.length })), null);
});

test('unfinished and shape-altered masks cannot forge completion claims', () => {
  const level = LEVELS[0];
  const base = { masks: [...level.initial], moves: 1, hints: 0, clean: true, elapsed: 10, completed: true };
  assert.deepEqual(sanitizeSave({ version: 1, claims: { [level.id]: base, foreign: base } }).claims, {});
  const changed = [...level.solution]; changed[0] = 15;
  assert.deepEqual(sanitizeSave({ version: 1, claims: { [level.id]: { ...base, masks: changed } } }).claims, {});
});

test('claim completion is idempotent and keeps the better independent run', () => {
  const data = freshSave(), { game } = solveByRotations(LEVELS[0]);
  assert.deepEqual(claimCompletion(data, game, 3, 30), { first: true, improved: false });
  const first = clone(data.claims[game.levelId]);
  assert.deepEqual(claimCompletion(data, game, 3, 31), { first: false, improved: false });
  assert.deepEqual(data.claims[game.levelId], first);
  assert.deepEqual(claimCompletion(data, game, 0, 50), { first: false, improved: true });
  assert.equal(data.claims[game.levelId].clean, true);
  assert.equal(campaignCount(data), 1); assert.equal(chapterCount(data, LEVELS[0].chapter), 1);
  assert.notEqual(nextCampaign(data).id, game.levelId);
});

test('unfinished games and invalid completion metrics never create a claim', () => {
  const data = freshSave(), { game } = solveByRotations(LEVELS[0]);
  for (const args of [[createGame(LEVELS[0]), 0, 0], [game, -1, 0], [game, 0, -1], [game, 4001, 0]]) {
    assert.deepEqual(claimCompletion(data, ...args), { first: false, improved: false });
  }
  assert.deepEqual(data.claims, {});
});

test('a forged clean flag cannot award a no-hint badge for a hinted claim', () => {
  const data = freshSave(), { game } = solveByRotations(LEVELS[0]);
  claimCompletion(data, game, 3, 10);
  data.claims[game.levelId].clean = true;
  const restored = sanitizeSave(clone(data));
  assert.notEqual(restored.claims[game.levelId]?.clean, true);
});

test('campaign progress excludes free/daily voyage claims and copying a save is independent', () => {
  const data = freshSave(), { game } = solveByRotations(VOYAGES[0]);
  claimCompletion(data, game, 0, 25);
  const restored = sanitizeSave(clone(data));
  assert.equal(campaignCount(restored), 0); assert.equal(nextCampaign(restored), LEVELS[0]);
  restored.claims[game.levelId].masks[0] = 0;
  assert.notEqual(data.claims[game.levelId].masks[0], 0);
});

test('save round trips use only the private key and do not clear foreign games', () => {
  const store = memoryStorage({ 'star-drift:v1': 'other-progress', foreign: 'do-not-touch' });
  const data = freshSave(); data.current = current(LEVELS[0], { hints: 2, elapsed: 15 });
  assert.equal(writeSave(store, data), true);
  assert.deepEqual(readSave(store), { data, available: true });
  assert.equal(store.values.get('star-drift:v1'), 'other-progress');
  assert.equal(store.values.get('foreign'), 'do-not-touch');
});

test('corrupt JSON resets this save without falsely declaring usable storage unavailable', () => {
  const store = memoryStorage({ [SAVE_KEY]: '{broken-json', foreign: 'untouched' });
  const read = readSave(store);
  assert.deepEqual(read.data, freshSave());
  assert.equal(read.available, true);
  assert.equal(writeSave(store, read.data), true);
  assert.equal(store.values.get('foreign'), 'untouched');
});

test('missing, throwing and quota-limited storage fail safely', () => {
  assert.deepEqual(readSave(memoryStorage()), { data: freshSave(), available: true });
  for (const store of [null, undefined, { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } }]) {
    assert.deepEqual(readSave(store), { data: freshSave(), available: false });
    assert.equal(writeSave(store, freshSave()), false);
  }
  const cyclic = freshSave(); cyclic.current = cyclic;
  assert.equal(writeSave(memoryStorage(), cyclic), false);
});

test('daily restoration preserves the played date and normalizes invalid dates safely', () => {
  const daily = validateCurrent(current(VOYAGES[0], { mode: 'daily', date: '2026-09-05', hints: 2 }));
  assert.equal(daily.date, '2026-09-05'); assert.equal(daily.mode, 'daily'); assert.equal(daily.hints, 2);
  assert.equal(validateCurrent(current(VOYAGES[0], { mode: 'daily', date: 'not-a-date' })).date, '');
});

test('per-size voyage counters are bounded and independent when restoring older saves', () => {
  const migrated = sanitizeSave({ version: 1, voyage: 300, voyageBySize: { 4: 39, 5: -1, 6: 40 } });
  assert.deepEqual(migrated.voyageBySize, { 4: 39, 5: 0, 6: 0 });
  assert.equal(migrated.voyage, 300);
});
