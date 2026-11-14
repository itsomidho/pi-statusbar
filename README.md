# pi-statusbar

Native Pi port of the animated mascot from `itsomidho/clawd-statusbar` (MIT).
## Install on another device

Requires Node.js and a current Pi installation supporting `ctx.ui.setFooter()`.
Install from GitHub:

```sh
pi install git:github.com/itsomidho/pi-statusbar
```

Run `/reload` in an existing Pi session. **OpenAI Codex is not required:** the
statusbar's general features use the active model/provider configured in Pi.
See [Provider setup and quota support](#provider-setup-and-quota-support) below.
Never copy authentication files into this repository. Git/PR details require
Git and optionally authenticated `gh`/`glab` on that device.

Update installed packages with `pi update --extensions`, then `/reload`.
Remove with `pi remove git:github.com/itsomidho/pi-statusbar`.

Do not load both the Git package and a manually copied extension simultaneously.
For manual installation, copy this directory to
`~/.pi/agent/extensions/pi-statusbar/` instead.

## Provider setup and quota support

Install the extension once; the installation command is the same for every
provider. Inside Pi, use `/login` to configure your provider and `/model` to
select a model. Available login methods depend on your Pi version and provider.
Authenticate separately on each device; do not transfer or commit `auth.json`.

| Provider | Configure in Pi | General statusbar | Provider quota meters |
|---|---|---|---|
| OpenAI Codex / ChatGPT subscription (`openai-codex`) | `/login`, select OpenAI Codex and complete the offered sign-in flow | Yes | Real 5h/7d used percentages and reset times, when the account endpoint supplies them |
| OpenAI API (`openai`) | `/login`, select OpenAI and provide an API key; alternatively set `OPENAI_API_KEY` before starting Pi | Yes | Not implemented; OpenAI API limits are not ChatGPT subscription quotas |
| Anthropic (`anthropic`) | `/login`, select Anthropic and use a supported method; API-key users can alternatively set `ANTHROPIC_API_KEY` | Yes | Not implemented, including Anthropic subscription quotas |
| GitHub Copilot (`github-copilot`) | `/login`, select GitHub Copilot and complete the offered flow; supported token configuration can use `COPILOT_GITHUB_TOKEN` | Yes | Copilot-specific allowance/premium-request meters are not implemented |
| Google Gemini, OpenRouter and other built-in providers | Configure the provider through Pi's `/login` or its documented environment variables, then select it with `/model` | Yes | Not implemented |
| Local models, custom providers and compatible API endpoints | Configure the provider/model using Pi's documentation, then select it with `/model` | Yes, for data exposed by Pi | Not implemented |

“General statusbar” means the model name, context usage when available, thinking
level when applicable, tool activity/mascot, and local project/Git/system details.
Individual models may not expose every metric. General rendering uses Pi's APIs;
not every provider has been independently tested end to end.

**Only the `openai-codex` provider triggers the quota request.** Choosing an
OpenAI model through Copilot, OpenRouter or another provider does not enable
Codex quotas. When switching away from Codex, its quota meters are hidden;
other providers' credentials are not sent to the ChatGPT usage endpoint.
Missing or unsupported quotas are hidden, never estimated from token counts.

For provider authentication details, consult the `docs/providers.md` shipped
with your Pi installation. Adding quota support for another provider requires
a separate integration with that provider's available account/usage API;
changing the installation command alone cannot enable it.

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
