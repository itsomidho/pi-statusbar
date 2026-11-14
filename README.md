# pi-statusbar

Native Pi port of the animated mascot from `itsomidho/clawd-statusbar` (MIT).
## Install on another device

Requires Node.js and a current Pi installation supporting `ctx.ui.setFooter()`.
Install from GitHub:

```sh
pi install git:github.com/itsomidho/pi-statusbar
```

Run `/reload` in an existing Pi session. Authenticate with OpenAI Codex through
Pi's `/login` on each device to enable quota meters. Never copy authentication
files into this repository. Git/PR details require Git and optionally authenticated
`gh`/`glab` on that device.

Update installed packages with `pi update --extensions`, then `/reload`.
Remove with `pi remove git:github.com/itsomidho/pi-statusbar`.

Do not load both the Git package and a manually copied extension simultaneously.
For manual installation, copy this directory to
`~/.pi/agent/extensions/pi-statusbar/` instead.

## Features

- `/statusbar` toggles the footer; `/statusbar on` and `/statusbar off` are explicit.
- Enabled by default on a new session/reload; toggle is session-local.
- Shows model, context percentage/tokens, thinking level, project folder, branch,
  changed files, upstream ahead/behind, stash count, linked worktree and Git operations.
- Animated cooking mascot shows tool activity, API silence after 15 seconds,
  user prompts, completion and interruption/error. Hides below 72 columns;
  captions hide below 84 columns. Other extensions' status text is preserved.
- Git/system data refresh every 5 seconds. CPU/RAM appear at 80% or higher.
- PR/MR and pipeline information uses existing `gh`/`glab` authentication;
  refreshes at most once a minute, asynchronously, with bounded command timeouts.
  GitHub and remotes containing `gitlab` are recognized. Other self-hosted GitLab
  hostnames are not auto-detected. No tools are downloaded or installed.
- For `openai-codex`, shows real 5h/7d used percentages and reset countdowns
  on the first line, after the session details (items that do not fit are hidden),
  from ChatGPT's internal `/backend-api/wham/usage` endpoint. Uses Pi's resolved
  provider authentication (including its refresh handling), polls every 60 seconds,
  has an 8-second request deadline and forbids redirects. Errors hide the values;
  other providers are not queried. Both windows show even below 50% usage.
  This internal endpoint may change. No credentials/identity data are logged or
  persisted. No Claude credentials or runtime are used.
- Does not infer background-agent activity outside Pi's exposed tool lifecycle.
- Only interactive TUI mode starts timers or Git/hosting commands; resources
  are stopped on disable, disposal and session shutdown.
- Replaces the stock footer; another extension replacing it is not composable.
  `/statusbar off` restores Pi's built-in footer.

## Development

```sh
npm install --ignore-scripts --legacy-peer-deps
npm test
```

With Pi already installed globally, `npm test` also works without installing
local dependencies. Test paths are portable across devices.

Verified with layout/lifecycle mocks and a real 110-column Pi pseudo-terminal
startup, including `/statusbar off` and `/statusbar on`. Hosting credentials,
live CI responses and visual appearance in the user's terminal still need
manual confirmation. Original Claude installation is unchanged.
