import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jiti, tuiPath } from './loader.mjs';
const view = await jiti.import('../view.ts');
const extension = (await jiti.import('../index.ts')).default;
const { visibleWidth } = await jiti.import(tuiPath);

test('safe layout over narrow, wide, Unicode and ANSI input', () => {
  for (let width = 1; width <= 180; width++) {
    const line = view.projectLine('~/projects/تست/漢字', 'feature/very-long-branch-name', ['●12', '↑2'], Math.max(0, width - 32));
    const rows = view.frame(['\x1b[32mModel 漢字\x1b[0m', line], width >= 72 ? ['▗ █▜██▛█ ▖ ~ ~', ' ▀██████▀  \\o/'] : [], width);
    for (const row of rows) assert.ok(visibleWidth(row) <= width, `${width}: ${row}`);
  }
  assert.equal(view.clean('foo\x1b\nbar'), 'foobar');
  assert.equal(view.activity('functions.read'), 'reading');
  assert.equal(view.activity('edit'), 'editing');
  assert.equal(view.activity('bash'), 'running');
  assert.notDeepEqual(view.figure(false), view.figure(true));
});

function harness(mode = 'tui') {
  const events = new Map(), commands = new Map();
  let component, factory, executions = 0;
  const pi = {
    on: (name, fn) => events.set(name, fn),
    registerCommand: (name, value) => commands.set(name, value),
    exec: async () => { executions++; return { code: 0, stdout: '', truncated: false }; },
  };
  const context = {
    mode, cwd: '/tmp', model: { name: 'Test 漢字' }, thinkingLevel: 'high',
    getContextUsage: () => ({ tokens: 12345, percent: 12 }),
    ui: {
      notify() {},
      setFooter(value) {
        component?.dispose(); component = undefined; factory = value;
        if (value) component = value({ requestRender() {} }, { fg: (_key, text) => text }, {
          onBranchChange: () => () => {}, getExtensionStatuses: () => new Map([['other', 'other extension status']]),
        });
      },
    },
  };
  extension(pi);
  return { events, commands, context, get component() { return component; }, get factory() { return factory; }, get executions() { return executions; } };
}

test('footer lifecycle, tool concurrency, interrupted turn, toggle and restoration', async () => {
  const h = harness();
  try {
    h.events.get('session_start')({}, h.context);
    await new Promise(r => setTimeout(r, 20));
    assert.ok(h.component);
    h.events.get('agent_start')({});
    h.events.get('tool_execution_start')({ toolCallId: 'a', toolName: 'read' });
    h.events.get('tool_execution_start')({ toolCallId: 'b', toolName: 'edit' });
    h.events.get('tool_execution_end')({ toolCallId: 'a' });
    assert.match(h.component.render(100).join('\n'), /editing/);
    for (let width = 1; width < 200; width++) for (const row of h.component.render(width)) assert.ok(visibleWidth(row) <= width);
    h.events.get('agent_settled')({ aborted: true });
    assert.match(h.component.render(100).join('\n'), / x /);
    assert.match(h.component.render(100).join('\n'), /other extension status/);
    await h.commands.get('statusbar').handler('off', h.context);
    assert.equal(h.factory, undefined);
    await h.commands.get('statusbar').handler('on', h.context);
    assert.ok(h.component);
    h.component.invalidate();
  } finally { h.events.get('session_shutdown')({}); h.component?.dispose(); }
});

test('both quota windows continue the first line with no extra quota row', async () => {
  const originalFetch = globalThis.fetch;
  const h = harness();
  h.context.model.provider = 'openai-codex';
  const token = 'x.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'test' } })).toString('base64url') + '.x';
  h.context.modelRegistry = { getProviderAuth: async () => ({ auth: { apiKey: token } }) };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ rate_limit: {
    primary_window: { limit_window_seconds: 18000, used_percent: 8, reset_at: 2000000000 },
    secondary_window: { limit_window_seconds: 604800, used_percent: 80, reset_at: 2000000000 },
  } }) });
  try {
    h.events.get('session_start')({}, h.context);
    await new Promise(r => setTimeout(r, 20));
    const rows = h.component.render(180);
    assert.match(rows[1], /Test.*CTX.*5h 8%.*7d 80%/);
    assert.equal(rows.length, 5); // borders, session, project, other-extension status
    for (let width = 1; width <= 180; width++) for (const row of h.component.render(width)) assert.ok(visibleWidth(row) <= width);
  } finally {
    h.events.get('session_shutdown')({}); h.component?.dispose();
    globalThis.fetch = originalFetch;
  }
});

test('non-TUI modes create no footer or background commands', async () => {
  for (const mode of ['rpc', 'json', 'print']) {
    const h = harness(mode);
    h.events.get('session_start')({}, h.context);
    h.events.get('agent_settled')({ aborted: false });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(h.factory, undefined);
    assert.equal(h.executions, 0);
    h.events.get('session_shutdown')({});
  }
});
