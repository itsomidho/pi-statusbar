// Mascot geometry adapted from itsomidho/clawd-statusbar (MIT).
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';

export const clean = (s: string) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
export const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
export function activity(tool: string) {
  const name = tool.toLowerCase().split(/[._]/).pop() ?? tool;
  if (/browser|playwright|webfetch|websearch/.test(tool.toLowerCase())) return 'browsing';
  if (/agent|delegate|spawn/.test(name)) return 'spawning';
  if (/read|grep|find|glob|ls/.test(name)) return 'reading';
  if (/edit|write/.test(name)) return 'editing';
  if (/bash|exec|shell|powershell/.test(name)) return 'running';
  return 'working';
}
export function figure(blink: boolean, hand = '') {
  const rows = ['....############....', '....############....', '..################..', '....############....'].map(s => [...s]);
  if (!blink) for (const c of [6, 13]) rows[1][c] = '.';
  if (hand === 'left') rows[1][1] = '#';
  if (hand === 'right') rows[1][18] = '#';
  const quarters = ' ▗▖▄▝▐▞▟▘▚▌▙▀▜▛█';
  const at = (r: number, c: number) => rows[r]?.[c] === '#' ? 1 : 0;
  return [0, 2].map(r => Array.from({ length: 10 }, (_, i) => {
    const c = i * 2;
    return quarters[at(r, c) * 8 + at(r, c + 1) * 4 + at(r + 1, c) * 2 + at(r + 1, c + 1)];
  }).join(''));
}
export function joinParts(parts: string[], width: number) {
  let out = '';
  for (const part of parts) {
    const next = out ? `${out} · ${part}` : part;
    if (visibleWidth(next) <= width) out = next;
  }
  return out;
}
export function projectLine(path: string, branch: string, extras: string[], width: number) {
  if (!branch) return joinParts([truncateToWidth(path, width), ...extras], width);
  const chip = truncateToWidth(`⎇ ${branch}`, Math.max(1, width - 4));
  const room = Math.max(0, width - visibleWidth(chip) - 3);
  let folder = path;
  if (visibleWidth(folder) > room) folder = `…/${path.split('/').pop()}`;
  folder = truncateToWidth(folder, room);
  return joinParts([...(folder ? [folder] : []), chip, ...extras], width);
}
export function frame(left: string[], right: string[], width: number) {
  if (width < 6) return left.map(s => truncateToWidth(s, width));
  const inner = width - 4;
  return [
    `╭${'─'.repeat(width - 2)}╮`,
    ...left.map((line, i) => {
      const tail = right[i] ?? '';
      const room = Math.max(0, inner - visibleWidth(tail) - (tail ? 2 : 0));
      const text = truncateToWidth(line, room);
      return `│ ${text}${' '.repeat(Math.max(0, inner - visibleWidth(text) - visibleWidth(tail)))}${tail} │`;
    }),
    `╰${'─'.repeat(width - 2)}╯`,
  ];
}
