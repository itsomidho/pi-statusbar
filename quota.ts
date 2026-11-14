export interface QuotaWindow { label: string; percent: number; resetAt: number }
export function parseQuota(data: unknown): QuotaWindow[] {
  const rate = (data as any)?.rate_limit;
  return ['primary_window', 'secondary_window'].flatMap(key => {
    const w = rate?.[key];
    const seconds = w?.limit_window_seconds;
    if (seconds !== 18000 && seconds !== 604800) return [];
    if (typeof w.used_percent !== 'number' || !Number.isFinite(w.used_percent) || w.used_percent < 0 || w.used_percent > 100) return [];
    if (typeof w.reset_at !== 'number' || !Number.isFinite(w.reset_at) || w.reset_at <= 0) return [];
    return [{ label: seconds === 18000 ? '5h' : '7d', percent: w.used_percent, resetAt: w.reset_at }];
  });
}
export function quotaText(w: QuotaWindow, now = Date.now()): string {
  const minutes = Math.max(0, Math.ceil((w.resetAt * 1000 - now) / 60000));
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), mins = minutes % 60;
  const reset = days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins}m` : `${mins}m`;
  return `${w.label} ${Math.round(w.percent)}% ↻ ${reset}`;
}
export async function fetchQuota(token: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<QuotaWindow[]> {
  // Same account claim used by Pi's Codex transport. Never log the JWT or identity.
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const account = payload?.['https://api.openai.com/auth']?.chatgpt_account_id;
  if (typeof account !== 'string' || !account) return [];
  const response = await request('https://chatgpt.com/backend-api/wham/usage', {
    headers: { Authorization: `Bearer ${token}`, 'ChatGPT-Account-Id': account, Accept: 'application/json' },
    signal, redirect: 'error',
  });
  if (!response.ok) return [];
  return parseQuota(await response.json());
}
