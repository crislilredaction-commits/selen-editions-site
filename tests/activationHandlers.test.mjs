import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual component and its JSX handlers with deterministic hook doubles.
// No SDK, DOM, timer or network implementation is loaded.
function mount(steps, suffix = 'token_hash=one-use&type=invite&next=/daily/portail/apprenant/test') {
  const slots = [], effects = [], calls = [], redirects = [];
  let cursor = 0, tree;
  const hook = (init) => { const i = cursor++; if (!(i in slots)) slots[i] = init(); return i; };
  const react = {
    useState(value) { const i = hook(() => value); return [slots[i], value => { slots[i] = value; }]; },
    useRef(value) { return slots[hook(() => ({ current: value }))]; },
    useMemo(fn) { return slots[hook(fn)]; },
    useEffect(fn) { hook(() => { effects.push(fn); }); },
  };
  const auth = Object.fromEntries(['verifyOtp', 'exchangeCodeForSession', 'setSession', 'refreshSession', 'updateUser'].map(name => [name, async (...args) => {
    calls.push({ name, args });
    const step = steps.shift();
    assert.ok(step, `Unexpected Auth call: ${name}`);
    assert.equal(name, step.name);
    if (step.throw) throw step.throw;
    return step.result;
  }]));
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  const source = fs.readFileSync('app/client/activation/page.tsx', 'utf8') + '\nexport { ClientActivationContent };';
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, URL, URLSearchParams,
    document: { title: 'Activation' },
    window: { location: { href: `https://test.invalid/client/activation?${suffix}` }, history: { replaceState(...args) { calls.push({ name: 'replaceState', args }); } }, setTimeout(fn) { fn(); } },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'next/navigation') return { useRouter: () => ({ replace: path => redirects.push(path), refresh() {} }), useSearchParams: () => new URLSearchParams(suffix) };
      if (name === '@/app/lib/supabase/client') return { createSupabaseBrowserClient(options) { assert.equal(options.detectSessionInUrl, false); return { auth }; } };
      if (['@/components/Header', '@/components/Footer'].includes(name)) return { default: name };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  function render() { cursor = 0; tree = module.exports.ClientActivationContent(); }
  function nodes(node = tree) { if (!node || typeof node !== 'object') return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(child => child == null ? [] : nodes(child))]; }
  render(); effects.splice(0).forEach(fn => fn()); render();
  return {
    calls, redirects,
    find: type => nodes().find(node => node.type === type),
    text: () => JSON.stringify(tree),
    async click(handler) { await (handler ?? nodes().find(node => node.type === 'button').props.onClick)(); render(); },
    async submit(password = 'Strong-password-123!') {
      nodes().filter(node => node.type === 'input').forEach(node => node.props.onChange({ target: { value: password } })); render();
      await nodes().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); render();
    },
    done() { assert.equal(steps.length, 0); },
  };
}
const ok = { data: { session: { access_token: 'test' } }, error: null };
const step = (name, error) => ({ name, result: error ? { data: { session: null }, error } : ok });
const retry = { name: 'AuthRetryableFetchError', status: 503 };

test('mount/scanner never consumes credentials; repeated transient verification can succeed', async () => {
  for (const error of [retry, { status: 429 }, { status: 500 }, { code: 'request_timeout' }, { code: 'unknown' }]) {
    const app = mount([step('verifyOtp', error), step('verifyOtp')]);
    assert.deepEqual(app.calls.map(call => call.name), ['replaceState']);
    assert.doesNotMatch(app.calls[0].args[2], /token_hash|type=/);
    await app.click();
    assert.equal(app.find('button').props.disabled, false);
    assert.match(app.text(), /Réessayez sur cette page/);
    await app.click();
    assert.ok(app.find('form'));
    assert.equal(app.calls[1].args[0].token_hash, app.calls[2].args[0].token_hash);
    app.done();
  }
});

test('definitively expired/used link stops verification, including stale handler', async () => {
  for (const code of ['otp_expired', 'session_expired', 'refresh_token_already_used', 'flow_state_expired']) {
    const app = mount([step('verifyOtp', { code, status: 403 })]);
    const handler = app.find('button').props.onClick;
    await app.click();
    assert.match(app.text(), /expiré ou a déjà été utilisé/);
    assert.equal(app.find('button'), undefined);
    await app.click(handler);
    app.done();
  }
});

test('network exception unlocks verification and keeps its credentials', async () => {
  const app = mount([{ name: 'verifyOtp', throw: new TypeError('offline') }, step('verifyOtp')]);
  await app.click();
  assert.equal(app.find('button').props.disabled, false);
  await app.click(); assert.ok(app.find('form')); app.done();
});

test('weak password rejection preserves session and accepts a second password without OTP', async () => {
  const app = mount([step('verifyOtp'), step('refreshSession'), step('updateUser', { code: 'weak_password' }), step('refreshSession'), step('updateUser')]);
  await app.click(); await app.submit('weak-password');
  assert.match(app.text(), /trop faible/);
  assert.equal(app.find('button').props.disabled, false);
  await app.submit();
  assert.deepEqual(app.redirects, ['/daily/portail/apprenant/test']);
  assert.equal(app.calls.filter(call => call.name === 'verifyOtp').length, 1);
  app.done();
});

test('refresh/update temporary errors and exceptions release loading and preserve form', async () => {
  for (const name of ['refreshSession', 'updateUser']) {
    for (const failure of [step(name, retry), step(name, { status: 429 }), { name, throw: new TypeError('offline') }]) {
      const app = mount([step('verifyOtp'), ...(name === 'updateUser' ? [step('refreshSession')] : []), failure, step('refreshSession'), step('updateUser')]);
      await app.click(); await app.submit();
      assert.ok(app.find('form')); assert.equal(app.find('button').props.disabled, false);
      assert.doesNotMatch(app.text(), /n’est plus valide/);
      assert.match(app.text(), /[Rr]éessayez sur cette page/);
      await app.submit(); assert.equal(app.redirects.length, 1); app.done();
    }
  }
});

test('unsafe next remains filtered after successful activation', async () => {
  for (const next of ['https://evil.invalid', '//evil.invalid', '/\\evil.invalid']) {
    const app = mount([step('verifyOtp'), step('refreshSession'), step('updateUser')], `token_hash=test&type=recovery&next=${encodeURIComponent(next)}`);
    await app.click(); await app.submit(); assert.deepEqual(app.redirects, ['/client']); app.done();
  }
});
