import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { LEVELS, voyageLevel } from '../src/campaign.mjs';
import { createGame, applyAction } from '../src/engine.mjs';
import { freshSave, SAVE_KEY } from '../src/storage.mjs';

// This harness executes the production entry point and imported modules. The
// deliberately small DOM models event/data flow only, never CSS or browser QA.
const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const bundles = new Map();
async function bundle(xhs) {
  if (!bundles.has(xhs)) bundles.set(xhs, (async () => {
    const source = await readFile(resolve(root, 'src/app.mjs'), 'utf8');
    const hook = `\nwindow.__test = {
      get state() { return {run, game, save, persistence, modalKind, hintIndex, freeSize}; },
      act, seek, travel, chooseTravel, revealHint, showHint, closeModal,
      showMap, showDaily, showFree, startFree, showSettings, finishRun, resetPrompt, resizeBoard
    };`;
    const result = await build({ stdin: { contents: source + hook, resolveDir: resolve(root, 'src'), sourcefile: 'app-review.mjs', loader: 'js' },
      bundle: true, write: false, format: 'iife', target: ['es2017', 'chrome61'], legalComments: 'none', define: { __XHS__: String(xhs) } });
    return result.outputFiles[0].text;
  })());
  return bundles.get(xhs);
}

class Element {
  constructor(tag, document) {
    this.tagName = tag.toLowerCase(); this.ownerDocument = document; this.children = []; this.parentNode = null;
    this.attributes = {}; this.dataset = {}; this.listeners = {}; this.className = ''; this.hidden = false; this.disabled = false;
    this.scrollTop = 0; this.offsetTop = 0; this._text = ''; this._html = '';
    this.style = { setProperty(name, value) { this[name] = String(value); }, getPropertyValue(name) { return this[name] || ''; } };
    this.classList = { contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => { const all = new Set(this.className.split(/\s+/).filter(Boolean)); const on = force ?? !all.has(name); if (on) all.add(name); else all.delete(name); this.className = [...all].join(' '); return on; },
      add: name => this.classList.toggle(name, true), remove: name => this.classList.toggle(name, false) };
  }
  set innerHTML(value) { this._html = String(value); this.children = []; this._text = ''; parseInto(this, this._html); }
  get innerHTML() { return this._html; }
  set textContent(value) { this._text = String(value); this._html = ''; this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  get clientWidth() { return this.ownerDocument.wrapWidth; }
  get offsetParent() { for (let node = this; node; node = node.parentNode) if (node.hidden) return null; return this.parentNode || this.ownerDocument.body; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name === 'disabled') this.disabled = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = String(value);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'hidden') this.hidden = false; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name, extra = {}) {
    const event = { type: name, target: this, key: '', shiftKey: false, ctrlKey: false, metaKey: false,
      defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const fn of this.listeners[name] || []) fn(event);
    return event;
  }
  click() { if (!this.disabled) return this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  matches(selector) {
    if (selector === 'button:not(:disabled)') return this.tagName === 'button' && !this.disabled;
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return attr[1] in this.attributes && (attr[2] === undefined || this.attributes[attr[1]] === attr[2]);
    return this.tagName === selector.toLowerCase();
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(part => part.trim()), results = [];
    const visit = node => { for (const child of node.children) { if (selectors.some(part => child.matches(part))) results.push(child); visit(child); } };
    visit(this); return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
}
function parseInto(parent, source) {
  const stack = [parent], voidTags = new Set(['meta', 'link', 'img', 'br', 'hr', 'input', 'path', 'circle', 'rect']);
  for (const token of source.matchAll(/<\/?([a-zA-Z][\w:-]*)([^>]*)>|([^<]+)/g)) {
    if (token[3]) { stack[stack.length - 1]._text += token[3]; continue; }
    const tag = token[1].toLowerCase();
    if (token[0].startsWith('</')) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName === tag) { stack.length = i; break; } continue; }
    const element = new Element(tag, parent.ownerDocument);
    for (const attr of token[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) element.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
    stack[stack.length - 1].appendChild(element);
    if (!voidTags.has(tag) && !token[0].endsWith('/>')) stack.push(element);
  }
}
function fakeDocument(width) {
  const document = { wrapWidth: width, hidden: false, listeners: {},
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); },
    dispatch(name, extra = {}) { const event = { key: '', preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const fn of this.listeners[name] || []) fn(event); return event; },
    createElement(tag) { return new Element(tag, this); },
    getElementById(id) { return this.documentElement.querySelector('#' + id); },
    contains(node) { return node === this.documentElement || this.documentElement.querySelectorAll('*').includes(node) || this.documentElement.querySelectorAll('button').includes(node); } };
  const holder = new Element('holder', document); parseInto(holder, html);
  document.documentElement = holder.querySelector('html'); document.body = document.documentElement.querySelector('body'); document.activeElement = document.body;
  document.contains = node => { for (let current = node; current; current = current.parentNode) if (current === document.documentElement) return true; return false; };
  return document;
}
async function boot({ data = freshSave(), encoded, denied = false, quota = false, reduced = false, modern = false, xhs = false, width = 320, height = 450 } = {}) {
  const values = new Map(encoded === undefined ? [[SAVE_KEY, JSON.stringify(data)]] : [[SAVE_KEY, encoded]]);
  const document = fakeDocument(278), timers = new Map(), intervals = new Map(); let nextId = 1;
  const window = { innerWidth: width, innerHeight: height, document, listeners: {},
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }, scrollTo() {},
    dispatch(name) { for (const fn of this.listeners[name] || []) fn({ type: name }); } };
  Object.defineProperty(window, 'localStorage', { get() { if (denied) throw Error('storage denied'); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (quota) throw Error('quota'); values.set(key, value); } }; } });
  if (modern || reduced) window.matchMedia = () => ({ matches: reduced });
  const context = vm.createContext({ window, document, console,
    setTimeout: (fn, delay) => { const id = nextId++; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { const id = nextId++; intervals.set(id, { fn, delay }); return id; }, clearInterval: id => intervals.delete(id) });
  if (!modern) vm.runInContext('Array.prototype.flatMap=undefined;Array.prototype.flat=undefined;Array.prototype.at=undefined;Object.fromEntries=undefined;Object.hasOwn=undefined;String.prototype.replaceAll=undefined;globalThis=undefined;', context);
  vm.runInContext(await bundle(xhs), context, { timeout: 5000 });
  return { api: window.__test, document, window, values, timers, intervals,
    button: label => document.getElementById('modal-actions').children.find(button => button.textContent === label),
    flush: () => { const current = [...timers]; for (const [id, entry] of current) if (timers.delete(id)) entry.fn(); },
    tick: () => { for (const entry of intervals.values()) entry.fn(); } };
}
function playableAction(game) {
  return game.orientations.map((_, index) => ({ type: 'rotate', index, turns: 1 })).find(action => {
    const result = applyAction(game, action); return result.accepted && result.state.status !== 'won';
  });
}
function solve(app) {
  for (let index = 0; index < app.api.state.game.level.total; index++) {
    let attempts = 0;
    while (app.api.state.game.orientations[index] !== app.api.state.game.level.solution[index]) {
      assert.ok(attempts++ < 3); app.api.act({ type: 'rotate', index, turns: 1 });
    }
  }
  assert.equal(app.api.state.game.status, 'won');
}

test('production entry boots both editions without modern APIs or optional media/browser capabilities', async () => {
  for (const xhs of [false, true]) {
    const app = await boot({ xhs });
    assert.equal(app.api.state.modalKind, 'tutorial');
    assert.equal(app.document.getElementById('board').children.length, LEVELS[0].total);
    app.button('下一张').click();
    assert.match(app.document.getElementById('modal-body').innerHTML, /真实操作后/);
    app.document.getElementById('modal-close').click();
    assert.equal(app.api.state.save.tutorial, 1);
    const action = playableAction(app.api.state.game); app.api.act(action);
    assert.equal(app.api.state.run.cursor, 1);
  }
});

test('denied localStorage getter and write quota cannot prevent play or optional sound settings', async () => {
  for (const setting of [{ denied: true }, { quota: true }]) {
    const app = await boot(setting); app.api.closeModal();
    app.api.act(playableAction(app.api.state.game));
    assert.equal(app.api.state.run.cursor, 1); assert.equal(app.api.state.persistence, false);
    app.api.showSettings(); app.document.getElementById('sound-toggle').click();
    assert.equal(app.api.state.save.settings.sound, true); app.api.closeModal();
    app.api.seek(-1); assert.equal(app.api.state.run.cursor, 0);
  }
});

test('actual tile click, lock, reverse and keyboard handlers use production state transitions', async () => {
  const app = await boot(); app.api.closeModal();
  const action = playableAction(app.api.state.game), tile = app.document.getElementById('board').children[action.index];
  tile.click(); assert.equal(app.api.state.game.moves, 1);
  app.document.getElementById('lock-btn').click(); tile.click();
  assert.equal(app.api.state.game.locked[action.index], true); assert.equal(app.api.state.game.moves, 1);
  app.document.getElementById('lock-btn').click(); tile.click(); assert.equal(app.api.state.game.moves, 1);
  tile.dispatch('contextmenu'); assert.equal(app.api.state.game.locked[action.index], false);
  app.document.getElementById('reverse-btn').click(); tile.click();
  assert.deepEqual(plain(app.api.state.game.orientations), [...app.api.state.game.level.initial]);
  tile.dispatch('keydown', { key: 'l' }); assert.equal(app.api.state.game.locked[action.index], true);
});

test('undo/redo restores state and hints remain used through seeking and reload', async () => {
  const app = await boot(); app.api.closeModal();
  const action = playableAction(app.api.state.game); app.api.act(action);
  const moved = plain(app.api.state.game.orientations);
  app.api.revealHint(action.index); app.api.closeModal();
  app.document.getElementById('undo-btn').click();
  assert.equal(app.api.state.run.cursor, 0); assert.equal(app.api.state.run.hints, 1);
  app.document.getElementById('redo-btn').click();
  assert.deepEqual(plain(app.api.state.game.orientations), moved); assert.equal(app.api.state.run.hints, 1);
  const restored = await boot({ encoded: app.values.get(SAVE_KEY) });
  assert.deepEqual(plain(restored.api.state.game.orientations), moved); assert.equal(restored.api.state.run.hints, 1);
});

test('a new action after undo discards only the redo tail and not hint accounting', async () => {
  const app = await boot(); app.api.closeModal();
  const action = playableAction(app.api.state.game); app.api.act(action); app.api.act({ type: 'toggle-lock', index: action.index });
  app.api.revealHint(action.index); app.api.closeModal(); app.api.seek(-1);
  app.api.act({ type: 'rotate', index: action.index, turns: -1 });
  assert.equal(app.api.state.run.actions.length, 2); assert.equal(app.api.state.run.cursor, 2);
  assert.equal(app.api.state.game.locked[action.index], false); assert.equal(app.api.state.run.hints, 1);
  assert.equal(app.document.getElementById('redo-btn').disabled, true);
});

test('hint preview is opt-in and helping a locked tile records unlock and real rotations', async () => {
  const app = await boot(); app.api.closeModal();
  const index = app.api.state.game.orientations.findIndex((mask, i) => mask !== app.api.state.game.level.solution[i]);
  app.api.showHint(); assert.equal(app.api.state.run.hints, 0); app.button('我再想想').click();
  app.api.act({ type: 'toggle-lock', index }); app.api.revealHint(index); app.button('帮我转正').click();
  assert.equal(app.api.state.run.hints, 1); assert.equal(app.api.state.game.locked[index], false);
  assert.equal(app.api.state.game.orientations[index], app.api.state.game.level.solution[index]);
  assert.ok(app.api.state.run.actions.some(action => action.type === 'rotate'));
});

test('completion persists once, survives reload and stale timers cannot open a win on another level', async () => {
  const data = freshSave(); data.tutorial = 1;
  const app = await boot({ data }); solve(app);
  const id = app.api.state.game.levelId;
  assert.equal(Object.keys(app.api.state.save.claims).length, 1);
  app.api.finishRun(); assert.equal(Object.keys(app.api.state.save.claims).length, 1);
  const restored = await boot({ encoded: app.values.get(SAVE_KEY) });
  assert.equal(restored.api.state.game.status, 'won'); assert.ok(restored.api.state.save.claims[id]);
  app.api.travel(LEVELS[1]); app.flush();
  assert.equal(app.api.state.modalKind, ''); assert.equal(app.api.state.game.levelId, LEVELS[1].id);
});

test('completion presentation survives another modal being open when its delay expires', async () => {
  const data = freshSave(); data.tutorial = 1;
  const app = await boot({ data }); solve(app);
  app.api.showSettings(); app.flush(); assert.equal(app.api.state.modalKind, 'settings');
  app.api.closeModal(); app.flush();
  assert.equal(app.api.state.modalKind, 'win');
  assert.equal(Object.keys(app.api.state.save.claims).length, 1);
});

test('free voyages increment only after confirmation and each size has its own sequence', async () => {
  const data = freshSave(); data.tutorial = 1;
  const app = await boot({ data }); app.api.act(playableAction(app.api.state.game));
  app.api.startFree(4); assert.equal(app.api.state.modalKind, 'switch');
  app.button('留在当前航线').click(); assert.equal(app.api.state.save.voyageBySize[4], 0);
  app.api.startFree(4); app.button('前往新航线').click();
  assert.equal(app.api.state.game.levelId, voyageLevel(0, 4).id); assert.equal(app.api.state.save.voyageBySize[4], 1);
  app.api.startFree(5); assert.equal(app.api.state.game.levelId, voyageLevel(0, 5).id);
  assert.equal(app.api.state.save.voyageBySize[4], 1); assert.equal(app.api.state.save.voyageBySize[5], 1);
  app.api.startFree(4); assert.equal(app.api.state.game.levelId, voyageLevel(1, 4).id);
});

test('a restored six-cell free voyage continues in its own size after completion', async () => {
  const data = freshSave(); data.tutorial = 1; data.voyageBySize[6] = 1;
  data.current = { levelId: voyageLevel(0, 6).id, actions: [], cursor: 0, hints: 0, elapsed: 0, mode: 'free', date: '' };
  const app = await boot({ data });
  solve(app); app.flush(); assert.equal(app.api.state.modalKind, 'win');
  app.button('下一条航线').click();
  assert.equal(app.api.state.game.level.width, 6);
  assert.equal(app.api.state.game.levelId, voyageLevel(1, 6).id);
});

test('map navigation exposes collection and free mode independently of hidden desktop panels', async () => {
  const app = await boot(); app.api.closeModal(); app.document.getElementById('map-btn').click();
  app.document.getElementById('map-collection').click(); assert.equal(app.api.state.modalKind, 'collection');
  app.api.showMap(); app.document.getElementById('map-free').click(); assert.equal(app.api.state.modalKind, 'free');
});

test('modal Escape and focus wrapping work without native dialog or inert APIs', async () => {
  const app = await boot();
  const modal = app.document.getElementById('modal');
  const focusable = modal.querySelectorAll('button:not(:disabled),[tabindex="0"]');
  focusable.at(-1).focus();
  const tab = app.document.dispatch('keydown', { key: 'Tab', shiftKey: false });
  assert.equal(tab.defaultPrevented, true); assert.equal(app.document.activeElement, focusable[0]);
  app.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(modal.hidden, true); assert.equal(app.api.state.save.tutorial, 1);
  assert.equal(app.document.getElementById('main').getAttribute('aria-hidden'), null);
});

test('time counts visible active play only and pagehide persists it', async () => {
  const app = await boot(); app.tick(); assert.equal(app.api.state.run.elapsed, 0);
  app.api.closeModal(); app.tick(); assert.equal(app.api.state.run.elapsed, 1);
  app.document.hidden = true; app.tick(); assert.equal(app.api.state.run.elapsed, 1);
  app.window.dispatch('pagehide'); assert.equal(JSON.parse(app.values.get(SAVE_KEY)).current.elapsed, 1);
});

test('reduced motion preference keeps state transitions and shortens completion presentation', async () => {
  const data = freshSave(); data.tutorial = 1;
  const app = await boot({ data, reduced: true });
  assert.equal(app.document.documentElement.classList.contains('motion-off'), true);
  solve(app); assert.ok([...app.timers.values()].some(timer => timer.delay === 150));
  app.flush(); assert.equal(app.api.state.modalKind, 'win');
});

test('full attribution and MIT text are available within the production settings flow', async () => {
  const app = await boot(); app.api.closeModal(); app.api.showSettings();
  app.document.getElementById('licenses-btn').click();
  const content = app.document.getElementById('modal-body').innerHTML;
  assert.match(content, /Permission is hereby granted/); assert.match(content, /Ten Realms Arcade contributors/);
  assert.match(content, /Simon Tatham/); assert.match(content, /ebnbin/);
  assert.doesNotMatch(content, /<a\b[^>]*href="https?:/);
});
