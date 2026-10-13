import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped consumer and its frozen vendor, never a wallet or network.
const source = fs.readFileSync(new URL('../site/static/zap-ui.js', import.meta.url), 'utf8');
const vendor = fs.readFileSync(new URL('../site/static/vendor/citrine-nostr-web.js', import.meta.url), 'utf8');
const key = 'a'.repeat(64);
const metadata = { allowsNostr: true, nostrPubkey: key, callback: 'https://wallet.example/pay', minSendable: 1000, maxSendable: 10000000 };
const response = body => ({ ok: true, text: async () => JSON.stringify(body) });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function fixture() {
  const requests = [], timers = [];
  const f = { requests, timers, focus: 0, renders: 0 };
  const window = { setTimeout: callback => timers.push(callback) };
  const document = { querySelector() { return { scrollIntoView() {}, select() {}, focus() { f.focus++; } }; } };
  const context = vm.createContext({ window, document, URL, AbortController, DOMException, TextEncoder, console,
    fetch(url, init) {
      const request = { url: new URL(url), init };
      requests.push(request);
      return Promise.resolve().then(() => f.fetch ? f.fetch(request) : response(request.url.pathname === '/pay' ? { pr: 'synthetic-invoice' } : metadata));
    }, recordRender() { f.renders++; } });
  vm.runInContext(vendor, context);
  window.citrine = context.citrine;
  const expose = `
    renderDialog = function () { recordRender(); };
    ensureModal = function () { return {}; };
    loadBtcUsdRate = function () { return Promise.resolve(0); };
    window.test = { modalState: modalState, initialHostState: initialHostState, openDialog: openDialog,
      closeDialog: closeDialog, createInvoice: createInvoice, copyInvoice: copyInvoice, payWithWebln: payWithWebln };
  `;
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, expose + '\n})();'), context);
  f.window = window;
  f.api = window.test;
  f.open = (name = 'alice', state) => {
    const options = { zapConfig: { lud16: name + '@wallet.example', defaultAmountSats: 21, relays: ['wss://relay.example'] }, target: { recipientPubkey: key } };
    state ||= f.api.initialHostState(options);
    f.api.openDialog({}, options, state);
    return state;
  };
  f.invoices = () => requests.filter(r => r.url.pathname === '/pay');
  return f;
}
const tests = [];
function test(name, run) { tests.push({ name, run }); }

for (const shared of [false, true]) test('unsigned invoice for ' + (shared ? 'unavailable shared signer' : 'absent signer'), async () => {
  const f = fixture(), state = f.open();
  if (shared) f.window.blogNostrSigner = { __wizardryShared: true, getStatus: async () => ({ available: false }), signEvent() { throw Error('must not sign'); } };
  await f.api.createInvoice();
  assert.equal(state.invoice, 'synthetic-invoice');
  assert.equal(f.invoices().length, 1);
  assert.equal(f.invoices()[0].url.searchParams.has('nostr'), false);
});

for (const stage of ['getStatus', 'getPublicKey', 'signEvent']) test('explicit refusal at ' + stage + ' cannot become fallback or signing', async () => {
  const f = fixture(), state = f.open(); let signs = 0;
  const signer = { getStatus: async () => ({ available: true }), getPublicKey: async () => key, signEvent: async value => { signs++; return value; } };
  signer[stage] = async () => { throw Error('User denied request; signer is not paired'); };
  f.window.blogNostrSigner = signer;
  await f.api.createInvoice();
  assert.match(state.status, /denied/);
  assert.equal(state.invoice, '');
  assert.equal(signs, 0);
  assert.equal(f.invoices().length, 0);
});

test('provider receivers retained and a shared provider resolves once', async () => {
  const f = fixture(), state = f.open(); let resolves = 0;
  const provider = { getPublicKey() { assert.equal(this, provider); return Promise.resolve(key); }, signEvent(value) { assert.equal(this, provider); return Promise.resolve(value); } };
  const shared = { __wizardryShared: true, getStatus() { assert.equal(this, shared); return Promise.resolve({ available: true }); }, resolve() { assert.equal(this, shared); resolves++; return Promise.resolve(provider); }, signEvent() { throw Error('do not re-resolve'); } };
  f.window.blogNostrSigner = shared;
  await f.api.createInvoice();
  assert.equal(resolves, 1);
  assert.equal(state.invoice, 'synthetic-invoice');
  assert(f.invoices()[0].url.searchParams.has('nostr'));
});

test('metadata completion after close cannot replace a new dialog or clear its busy state', async () => {
  const f = fixture(), old = deferred(), current = deferred();
  f.fetch = ({ url }) => url.pathname.includes('alice') ? old.promise : current.promise;
  const first = f.open(); const before = f.api.createInvoice(); await tick();
  const signal = f.requests[0].init.signal;
  f.api.closeDialog();
  assert(signal.aborted);
  const second = f.open('bob'); const after = f.api.createInvoice(); await tick();
  old.resolve(response(metadata)); await before;
  assert.equal(first.busy, false);
  assert.equal(second.busy, true);
  assert.equal(second.invoice, '');
  assert.equal(f.invoices().length, 0);
  f.api.closeDialog(); current.reject(Error('cancelled fixture')); await after;
});

for (const stage of ['getStatus', 'getPublicKey', 'signEvent']) test('cancel while ' + stage + ' is pending prevents subsequent effects', async () => {
  const f = fixture(), pending = deferred(); let signs = 0;
  f.window.blogNostrSigner = { getStatus: async () => ({ available: true }), getPublicKey: async () => key, signEvent: async value => { signs++; return value; } };
  f.window.blogNostrSigner[stage] = () => pending.promise;
  const old = f.open(); const work = f.api.createInvoice(); await tick();
  f.api.closeDialog(); const current = f.open('bob');
  pending.resolve(stage === 'getStatus' ? { available: true } : stage === 'getPublicKey' ? key : {});
  await work;
  assert.equal(signs, 0);
  assert.equal(f.invoices().length, 0);
  assert.equal(current.status, '');
  assert.equal(old.busy, false);
});

test('late invoice and focus timer cannot affect a reopened copy of the same state', async () => {
  const f = fixture(), pending = deferred();
  f.fetch = ({ url }) => url.pathname === '/pay' ? pending.promise : response(metadata);
  const state = f.open(); const work = f.api.createInvoice(); await tick();
  f.api.closeDialog(); f.open('alice', state);
  pending.resolve(response({ pr: 'old-invoice' })); await work;
  assert.equal(state.invoice, '');
  f.fetch = undefined; await f.api.createInvoice();
  assert.equal(state.invoice, 'synthetic-invoice');
  f.api.closeDialog(); f.open('bob'); f.timers.forEach(fn => fn());
  assert.equal(f.focus, 0);
});

test('failed metadata is retryable and repeated clicks share one active attempt', async () => {
  const f = fixture(); let attempts = 0;
  f.fetch = ({ url }) => {
    if (url.pathname === '/pay') return response({ pr: 'retry-invoice' });
    if (++attempts === 1) throw Error('temporary metadata error');
    return response(metadata);
  };
  const state = f.open(); const first = f.api.createInvoice();
  assert.equal(f.api.createInvoice(), undefined); await first;
  await f.api.createInvoice();
  assert.equal(attempts, 2);
  assert.equal(state.invoice, 'retry-invoice');
});

test('late clipboard acknowledgement cannot change reopened dialog', async () => {
  const f = fixture(), pending = deferred();
  f.window.navigator = { clipboard: { writeText: () => pending.promise } };
  const state = f.open(); state.invoice = 'synthetic-invoice';
  const work = f.api.copyInvoice(); f.api.closeDialog();
  const next = f.open('bob'); pending.resolve(); await work;
  assert.equal(next.status, '');
});

for (const action of ['close', 'replace']) test('WebLN ' + action + ' during enable prevents sendPayment', async () => {
  const f = fixture(), pending = deferred(); let sends = 0;
  const provider = { enable() { assert.equal(this, provider); return pending.promise; }, sendPayment() { sends++; return Promise.resolve(); } };
  f.window.webln = provider;
  const state = f.open(); state.invoice = 'synthetic-invoice';
  const work = f.api.payWithWebln(); await tick();
  if (action === 'close') { f.api.closeDialog(); f.open('alice', state); }
  else f.window.webln = {};
  pending.resolve(); await work;
  assert.equal(sends, 0);
  assert.equal(state.paying, false);
});

test('WebLN keeps receivers, prevents duplicate submission, and preserves provider refusal', async () => {
  const f = fixture(), pending = deferred(); let sends = 0;
  const provider = { enable() { assert.equal(this, provider); return Promise.resolve(); }, sendPayment(invoice) { assert.equal(this, provider); assert.equal(invoice, 'synthetic-invoice'); sends++; return pending.promise; } };
  f.window.webln = provider;
  const state = f.open(); state.invoice = 'synthetic-invoice';
  const work = f.api.payWithWebln(); assert.equal(f.api.payWithWebln(), undefined); await tick();
  pending.reject(Error('User denied payment')); await work;
  assert.equal(sends, 1);
  assert.equal(state.invoice, 'synthetic-invoice');
  assert.match(state.status, /denied/);
});

let passed = 0;
for (const { name, run } of tests) {
  try { await run(); passed++; console.log('ok - ' + name); }
  catch (error) { console.error('not ok - ' + name); throw error; }
}
console.log(`PASS ${passed} zap dialog lifecycle checks; no real requests, signatures or payments.`);
