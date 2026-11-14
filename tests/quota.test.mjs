import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jiti } from './loader.mjs';
const { parseQuota, quotaText, fetchQuota } = await jiti.import('../quota.ts');
const window = (seconds, percent) => ({ limit_window_seconds: seconds, used_percent: percent, reset_at: 2000000000 });
const data = { rate_limit: { primary_window: window(18000, 8), secondary_window: window(604800, 80) } };

test('parses actual quota windows, including weekly below 50%', () => {
  assert.deepEqual(parseQuota(data).map(w => [w.label, w.percent]), [['5h', 8], ['7d', 80]]);
  assert.equal(parseQuota({ rate_limit: { secondary_window: window(604800, 12) } })[0].percent, 12);
  for (const value of [undefined, null, {}, { rate_limit: { primary_window: window(60, 8) } }, { rate_limit: { primary_window: window(18000, '8') } }, { rate_limit: { primary_window: window(18000, 101) } }]) assert.deepEqual(parseQuota(value), []);
  assert.equal(quotaText({ label: '5h', percent: 8, resetAt: 7200 }, 0), '5h 8% ↻ 2h 0m');
});
test('uses fixed endpoint, account claim and forbids redirects', async () => {
  const token = 'x.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'test-account' } })).toString('base64url') + '.x';
  const signal = new AbortController().signal;
  const result = await fetchQuota(token, signal, async (url, options) => {
    assert.equal(url, 'https://chatgpt.com/backend-api/wham/usage');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.headers['ChatGPT-Account-Id'], 'test-account');
    assert.equal(options.redirect, 'error');
    assert.equal(options.signal, signal);
    return { ok: true, json: async () => data };
  });
  assert.equal(result.length, 2);
  assert.deepEqual(await fetchQuota(token, signal, async () => ({ ok: false })), []);
  await assert.rejects(fetchQuota(token, signal, async () => { throw new Error('offline'); }));
});
