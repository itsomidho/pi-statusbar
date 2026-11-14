import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { cpus, freemem, totalmem, homedir } from 'node:os';
import { access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { activity, clean, compact, figure, frame, joinParts, projectLine } from './view.ts';
import { fetchQuota, quotaText, type QuotaWindow } from './quota.ts';

export default function (pi: ExtensionAPI) {
  let enabled = true;
  let ctx: ExtensionContext;
  let requestRender = () => {};
  let timer: ReturnType<typeof setInterval> | undefined;
  let controller: AbortController | undefined;
  let refreshing = false;
  let quotas: QuotaWindow[] = [];
  let quotaProvider = '';
  let quotaCheckedAt = 0;
  let quotaController: AbortController | undefined;
  async function refreshQuota() {
    const provider = ctx.model?.provider ?? '';
    if (provider !== quotaProvider) {
      quotaController?.abort();
      quotas = []; quotaCheckedAt = 0; quotaProvider = provider;
    }
    if (!enabled || ctx.mode !== 'tui' || provider !== 'openai-codex' || quotaController || Date.now() - quotaCheckedAt < 60_000) return;
    quotaCheckedAt = Date.now();
    const abort = quotaController = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    try {
      const resolved = await ctx.modelRegistry.getProviderAuth('openai-codex');
      if (abort.signal.aborted) return;
      const token = resolved?.auth.apiKey;
      const result = token ? await fetchQuota(token, abort.signal) : [];
      if (!abort.signal.aborted && ctx.model?.provider === provider) quotas = result;
    } catch { if (quotaController === abort) quotas = []; }
    finally {
      clearTimeout(timeout);
      if (quotaController === abort) {
        if (abort.signal.aborted) quotas = [];
        quotaController = undefined;
      }
      requestRender();
    }
  }
  let busy = false, asking = false, failed = false;
  let started = 0, lastSign = 0, servedUntil = 0, lastRefresh = 0, lastReview = 0;
  let branch = '', extras: string[] = [], review = '', reviewKey = '';
  let system: string[] = [];
  const tools = new Map<string, string>();
  const cpuSample = () => cpus().reduce((a, c) => {
    a.idle += c.times.idle;
    a.total += Object.values(c.times).reduce((n, t) => n + t, 0);
    return a;
  }, { idle: 0, total: 0 });
  let previousCPU = cpuSample();

  async function run(command: string, args: string[], signal: AbortSignal) {
    try {
      const r = await pi.exec(command, args, { cwd: ctx.cwd, signal, timeout: 5000, maxBuffer: 512 * 1024 });
      return r.code === 0 && !r.truncated ? r.stdout.trimEnd() : '';
    } catch { return ''; }
  }
  async function fetchReview(remote: string, ref: string, signal: AbortSignal) {
    // Only recognized hosting URLs; never treat an arbitrary remote as GitLab.
    if (/(?:github\.com[:/])/.test(remote)) {
      const raw = await run('gh', ['pr', 'view', ref, '--json', 'number,state,statusCheckRollup'], signal);
      try {
        const pr = JSON.parse(raw);
        if (pr.state !== 'OPEN') return '';
        const checks = pr.statusCheckRollup ?? [];
        const bad = checks.some((c: any) => /FAILURE|ERROR|CANCELLED|TIMED_OUT|ACTION_REQUIRED/.test(c.conclusion ?? c.state ?? ''));
        const pending = checks.some((c: any) => (c.status && c.status !== 'COMPLETED') || /PENDING|EXPECTED/.test(c.state ?? ''));
        return `#${pr.number}${checks.length ? bad ? ' ✗' : pending ? ' ◔' : ' ✓' : ''}`;
      } catch {
        try {
          const runs = JSON.parse(await run('gh', ['run', 'list', '--branch', ref, '--limit', '1', '--json', 'status,conclusion'], signal));
          const latest = runs[0];
          return latest ? `CI ${latest.status !== 'completed' ? '◔' : latest.conclusion === 'success' ? '✓' : latest.conclusion === 'failure' ? '✗' : clean(latest.conclusion ?? '')}` : '';
        } catch { return ''; }
      }
    }
    if (/gitlab/i.test(remote)) {
      const raw = await run('glab', ['api', `projects/:fullpath/merge_requests?source_branch=${encodeURIComponent(ref)}&state=opened&per_page=1`], signal);
      try {
        const mr = JSON.parse(raw)[0];
        if (!mr) {
          const pipelines = JSON.parse(await run('glab', ['api', `projects/:fullpath/pipelines?ref=${encodeURIComponent(ref)}&per_page=1`], signal));
          const status = pipelines[0]?.status;
          return status ? `CI ${status === 'success' ? '✓' : status === 'failed' ? '✗' : /running|pending|created|preparing/.test(status) ? '◔' : clean(status)}` : '';
        }
        const detail = JSON.parse(await run('glab', ['api', `projects/:fullpath/merge_requests/${mr.iid}`], signal));
        const status = detail.head_pipeline?.status;
        return `!${mr.iid}${status === 'success' ? ' ✓' : status === 'failed' ? ' ✗' : /running|pending|created|preparing/.test(status ?? '') ? ' ◔' : ''}`;
      } catch { return ''; }
    }
    return '';
  }
  async function refresh() {
    if (refreshing || !enabled || ctx.mode !== 'tui') return;
    refreshing = true;
    const abort = controller = new AbortController();
    const signal = abort.signal;
    try {
      const sample = cpuSample(), delta = sample.total - previousCPU.total;
      const cpu = delta > 0 ? Math.round(100 * (1 - (sample.idle - previousCPU.idle) / delta)) : 0;
      previousCPU = sample;
      const ram = Math.round(100 * (1 - freemem() / totalmem()));
      system = [...(cpu >= 80 ? [`CPU ${cpu}%`] : []), ...(ram >= 80 ? [`RAM ${ram}%`] : [])];
      const status = await run('git', ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '--show-stash'], signal);
      let nextBranch = '', dirty = 0;
      const nextExtras: string[] = [];
      for (const line of status.split('\n')) {
        if (line.startsWith('# branch.head ')) nextBranch = line.slice(14);
        else if (line.startsWith('# branch.ab ')) {
          const [, ahead, behind] = line.match(/\+(\d+) -(\d+)/) ?? [];
          if (+ahead > 0) nextExtras.push(`↑${ahead}`);
          if (+behind > 0) nextExtras.push(`↓${behind}`);
        } else if (line.startsWith('# stash ')) nextExtras.push(`≡${line.slice(8)}`);
        else if (line && !line.startsWith('#')) dirty++;
      }
      if (nextBranch === '(detached)') nextBranch = await run('git', ['rev-parse', '--short', 'HEAD'], signal);
      if (dirty) nextExtras.unshift(`●${dirty}`);
      if (nextBranch) {
        const paths = (await run('git', ['rev-parse', '--path-format=absolute', '--absolute-git-dir', '--git-common-dir'], signal)).split('\n');
        if (paths[0] && paths[1] && paths[0] !== paths[1]) nextExtras.push(`worktree ${basename(ctx.cwd)}`);
        for (const [file, label] of [['rebase-merge', 'rebasing'], ['rebase-apply', 'rebasing'], ['MERGE_HEAD', 'merging'], ['CHERRY_PICK_HEAD', 'cherry-picking'], ['REVERT_HEAD', 'reverting'], ['BISECT_LOG', 'bisecting']]) {
          try { await access(join(paths[0], file)); nextExtras.unshift(`⚠ ${label}`); break; } catch {}
        }
      }
      if (signal.aborted) return;
      branch = clean(nextBranch); extras = nextExtras.map(clean);
      requestRender();
      const key = `${ctx.cwd}:${branch}`;
      if (key !== reviewKey) { review = ''; lastReview = 0; reviewKey = key; }
      if (branch && Date.now() - lastReview >= 60_000) {
        lastReview = Date.now();
        const remote = await run('git', ['remote', 'get-url', 'origin'], signal);
        const result = await fetchReview(remote, branch, signal);
        if (!signal.aborted) review = clean(result);
      }
    } finally {
      refreshing = false;
      if (controller === abort) controller = undefined;
      if (!signal.aborted) requestRender();
    }
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
    controller?.abort();
    quotaController?.abort();
    quotas = []; quotaCheckedAt = 0;
    requestRender = () => {};
  }
  function install(context: ExtensionContext) {
    ctx = context;
    if (!enabled || ctx.mode !== 'tui') return;
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(requestRender);
      timer = setInterval(() => {
        const now = Date.now();
        if (now - lastRefresh >= 5000) { lastRefresh = now; void refresh(); void refreshQuota(); }
        requestRender();
      }, 150);
      timer.unref();
      void refresh();
      void refreshQuota();
      return {
        invalidate() {},
        dispose() { unsubscribe(); stop(); },
        render(width: number) {
          const now = Date.now();
          const tool = [...tools.values()].at(-1) ?? '';
          const quiet = busy && !tool && !asking && now - lastSign > 15_000;
          const label = asking ? 'asking' : tool ? activity(tool) : busy ? quiet ? 'no reply' : 'thinking' : '';
          const usage = ctx.getContextUsage();
          const first = [theme.fg('accent', `◆ ${clean(ctx.model?.name ?? ctx.model?.id ?? 'Pi')}`)];
          if (usage?.percent != null) first.push(`CTX ${Math.round(usage.percent)}%${usage.tokens != null ? ` ${compact(usage.tokens)}` : ''}`);
          const quotaParts = ctx.model?.provider === quotaProvider && now - quotaCheckedAt < 120_000
            ? quotas.map(w => theme.fg(w.percent >= 80 ? 'error' : w.percent >= 50 ? 'warning' : 'success', quotaText(w, now))) : [];
          if (ctx.thinkingLevel && ctx.thinkingLevel !== 'off') first.push(ctx.thinkingLevel);
          first.push(...system);
          const path = clean(ctx.cwd === homedir() ? '~' : ctx.cwd.startsWith(`${homedir()}/`) ? `~${ctx.cwd.slice(homedir().length)}` : ctx.cwd);
          let right: string[] = [];
          if (width >= 72) {
            const tick = Math.floor((now - started) / 150);
            const cooking = busy && !quiet && !asking;
            const body = figure(now % 4500 < 160, cooking ? Math.floor(tick / 4) % 2 ? 'left' : 'right' : '');
            const yolk = now - started >= 30_000 ? '●' : now - started >= 10_000 ? '◉' : 'o';
            const served = !busy && now < servedUntil;
            const steam = cooking ? tick < 4 ? ' o ' : ['~ ~', '~°~', ' ~ ', '°~°'][Math.floor(tick / 2) % 4] : served ? failed ? ' x ' : ' ✓ ' : '   ';
            const pan = cooking || served || quiet ? `\\${yolk}/` : '\\_/';
            const caption = width >= 84 ? label.padEnd(10) + '  ' : '';
            const sub = width >= 84 ? clean(tool.split(/[._]/).pop() ?? '').slice(0, 10).padEnd(10) + '  ' : '';
            right = [theme.fg(quiet || asking ? 'warning' : 'accent', `${caption}${body[0]} ${steam}`), `${theme.fg('accent', sub + body[1])} ${theme.fg(cooking ? 'error' : served ? failed ? 'error' : 'success' : 'dim', pan)}`];
          } else if (label) first.push(label);
          const room = Math.max(0, width - 4 - (right.length ? width >= 84 ? 28 : 16 : 0));
          const lines = [joinParts([...first, ...quotaParts], room), projectLine(path, branch, [...extras, ...(review ? [review] : [])], room)];
          const statuses = [...footerData.getExtensionStatuses().values()];
          if (statuses.length) lines.push(joinParts(statuses, Math.max(0, width - 4)));
          return frame(lines, right, width);
        },
      };
    });
  }
  pi.on('session_start', (_event, context) => install(context));
  pi.on('session_shutdown', () => stop());
  pi.on('model_select', (_event, context) => { ctx = context; void refreshQuota(); });
  pi.on('agent_start', () => { if (!busy) started = Date.now(); busy = true; failed = false; lastSign = Date.now(); });
  pi.on('message_update', () => { lastSign = Date.now(); });
  pi.on('message_end', event => { if (event.message.role === 'assistant') failed = event.message.stopReason === 'error' || event.message.stopReason === 'aborted'; });
  pi.on('tool_execution_start', event => { tools.set(event.toolCallId, event.toolName); lastSign = Date.now(); });
  pi.on('tool_execution_end', event => { tools.delete(event.toolCallId); lastSign = Date.now(); });
  pi.on('ui_prompt_start', () => { asking = true; });
  pi.on('ui_prompt_end', () => { asking = false; lastSign = Date.now(); });
  pi.on('agent_settled', event => { busy = false; asking = false; tools.clear(); failed ||= event.aborted; servedUntil = Date.now() + 2000; void refresh(); });
  pi.registerCommand('statusbar', {
    description: 'Toggle pi-statusbar (on/off)' ,
    handler: async (args, context) => {
      const value = args.trim();
      if (value && value !== 'on' && value !== 'off') { context.ui.notify('Usage: /statusbar [on|off]', 'info'); return; }
      const next = value ? value === 'on' : !enabled;
      if (next === enabled) return;
      enabled = next;
      if (enabled) install(context);
      else { stop(); context.ui.setFooter(undefined); }
      context.ui.notify(`pi-statusbar ${enabled ? 'on' : 'off'}`, 'info');
    },
  });
}
