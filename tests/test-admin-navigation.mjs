import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../site/static/admin.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../site/lodestone/pages/admin.stone.html', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert(start >= 0, `${name} exists`);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
}
let focused;
function node(tag) {
  const attrs = attributes(tag);
  const classes = new Set((attrs.class || '').split(' '));
  return {
    attrs, hidden: /\shidden(?:\s|>)/.test(tag), disabled: false,
    tabIndex: Number(attrs.tabindex), listeners: {},
    getAttribute: key => attrs[key] ?? null,
    setAttribute: (key, value) => { attrs[key] = value; },
    removeAttribute: key => { delete attrs[key]; },
    classList: { toggle: (key, on) => on ? classes.add(key) : classes.delete(key), remove: key => classes.delete(key) },
    querySelectorAll: () => [], focus() { focused = this; },
    addEventListener(key, handler) { this.listeners[key] = handler; }
  };
}
const buttons = [...html.matchAll(/<button\b[^>]*data-admin-nav="[^"]+"[^>]*>/g)].map(m => node(m[0]));
const sections = [...html.matchAll(/<section\b[^>]*data-admin-section="[^"]+"[^>]*>/g)].map(m => node(m[0]));
assert.equal(buttons.length, sections.length);
assert(buttons.length > 10);
assert.match(html, /role="tablist"[^>]*aria-orientation="vertical"/);
for (const button of buttons) {
  assert.equal(button.attrs.role, 'tab');
  const panel = sections.find(p => p.attrs.id === button.attrs['aria-controls']);
  assert(panel, 'each tab controls a real panel');
  assert.equal(panel.attrs.role, 'tabpanel');
  assert.equal(panel.attrs['aria-labelledby'], button.attrs.id);
}
const state = { isAdmin: true, configHydrated: true, plugins: {}, loadedAdminSections: {} };
const window = { location: { hash: '#settings' }, addEventListener() {} };
const context = vm.createContext({ state, window, history: { replaceState(_a, _b, hash) { window.location.hash = hash; } },
  els: { sectionButtons: buttons, sections }, HTMLDialogElement: class {},
  resetPostCrosspostDialogState() {}, syncAdminDocumentTitle() {}, adminSectionNeedsLazyLoad: () => false,
  persistAdminComposeSession() {}, syncUsersAutoRefresh() {}, syncDraftsAutoRefresh() {}, syncQueueAutoRefresh() {},
  syncPostsAutoRefresh() {}, syncNosterAutoRefresh() {}, syncZapsAutoRefresh() {}, syncBtcpayAutoRefresh() {},
  syncModerationAutoRefresh() {}, syncVideoChatOperatorAutoRefresh() {}, renderUploadJobs() {}, maybeLoadAdminSection() {}
});
for (const name of ['sectionNodeForName', 'adminSectionIsAvailable', 'getSectionFromHash', 'resetAdminSectionArtifacts', 'activateSection', 'onAdminSectionKeydown', 'initSectionNavigation']) {
  vm.runInContext(extract(name), context);
}
context.initSectionNavigation();
function button(name) { return buttons.find(b => b.attrs['data-admin-nav'] === name); }
function press(name, key, modifiers = {}) {
  let prevented = false;
  const currentTarget = button(name);
  currentTarget.listeners.keydown({ currentTarget, key, preventDefault() { prevented = true; }, ...modifiers });
  return prevented;
}
function selected(name) {
  assert.equal(state.activeSection, name);
  assert.deepEqual(buttons.filter(b => b.tabIndex === 0), [button(name)]);
  assert.equal(button(name).attrs['aria-selected'], 'true');
  assert.deepEqual(sections.filter(p => !p.hidden).map(p => p.attrs['data-admin-section']), [name]);
}
selected('settings');
assert(press('settings', 'ArrowDown'));
selected('btcpay'); // Disabled plugins between these sections are skipped.
assert.equal(focused, button('btcpay'));
assert.equal(window.location.hash, '#btcpay');
button('drafts').hidden = true;
button('queue').disabled = true;
assert(press('btcpay', 'Home'));
selected('compose');
assert(press('compose', 'ArrowDown'));
selected('posts');
assert(press('posts', 'End'));
selected('plugins');
assert(press('plugins', 'ArrowDown'));
selected('compose');
assert(press('compose', 'ArrowUp'));
selected('plugins');
assert.equal(press('plugins', 'Home', { ctrlKey: true }), false);
assert.equal(press('plugins', 'ArrowRight'), false);
selected('plugins');
button('account').listeners.click();
selected('account');
state.isAdmin = false;
assert(press('account', 'ArrowUp'));
selected('account');
assert.equal(focused, button('account'));
console.log(`PASS: ${buttons.length} linked tabs; selection, keyboard wrapping, hidden/disabled plugins, modifiers and account-only navigation`);
