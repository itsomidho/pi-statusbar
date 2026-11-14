import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const local = createRequire(import.meta.url);
let require = local;
try { local.resolve('jiti'); local.resolve('@earendil-works/pi-tui'); }
catch {
  // Allow testing against an existing global Pi installation without npm install.
  const root = process.env.PI_TEST_PACKAGE_ROOT ?? join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), '@earendil-works/pi-coding-agent');
  require = createRequire(join(root, 'package.json'));
}
const { createJiti } = require('jiti');
export const tuiPath = require.resolve('@earendil-works/pi-tui');
export const jiti = createJiti(import.meta.url, { alias: { '@earendil-works/pi-tui': tuiPath } });
