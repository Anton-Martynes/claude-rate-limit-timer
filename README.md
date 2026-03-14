# claude-rate-limit-timer

A **Claude Code plugin** that intercepts API rate-limit pauses, shows a live
countdown timer in your terminal, and automatically resumes your command when
the quota resets — so you never have to babysit a stalled session.

```
⚡ Claude Code — Rate Limit Hit
   Waiting 60s for the API quota to reset …

⏱  00:42 remaining  [████████████░░░░░░░░░░░░░░░░░░]  40%

✅ Rate limit reset — resuming your command …
```

---

## Installation

### Via npm (recommended)

```bash
npm install -g claude-rate-limit-timer
```

The postinstall script automatically attempts to register the plugin with
Claude Code. If it succeeds you're done — restart Claude Code and the timer
is active.

If the auto-install is skipped (e.g. Claude Code wasn't in PATH yet), finish
setup with one extra command:

```bash
claude-rate-limit-timer install
```

#### Other CLI options

```bash
# Install for the current project only (adds to .claude/settings.json)
claude-rate-limit-timer install --scope project

# Check whether the plugin is registered
claude-rate-limit-timer status

# Remove the plugin
claude-rate-limit-timer uninstall
```

---

### Manual installation (without npm)

```bash
# One-off — current session only
claude --plugin-dir /path/to/rate-limit-timer

# Permanent — all projects
claude plugin install /path/to/rate-limit-timer --scope user

# Permanent — current project only
claude plugin install /path/to/rate-limit-timer --scope project
```

---

## Requirements

- **Claude Code** — https://claude.ai/download
- **Node.js ≥ 16** (for the npm CLI wrapper)
- **Python 3.7+** — pre-installed on macOS and most Linux distros

No external Python or Node packages are needed.

---

## How it works

The plugin registers three hooks that cover every place a rate limit can surface:

| Hook | When it fires | What it does |
|---|---|---|
| `Stop` | Claude finishes a turn | Scans the transcript for rate-limit language; if found → countdown → sends `{"continue": true}` so Claude resumes |
| `Notification` | Claude Code fires a UI notification | Same detection; catches the built-in rate-limit notification Claude Code shows |
| `PostToolUseFailure` | A tool call returns an error | Catches 429 / overload errors mid-task; counts down; Claude Code retries automatically |

The watcher tries several strategies to determine the correct wait time:

1. Explicit `retry_after` / `reset_at` field in the hook payload
2. Unix timestamp in `reset_time` / `resetAt`
3. "retry after N seconds" pattern in the error text
4. "HH:MM:SS" / "MM:SS" countdown pattern in the error text
5. Falls back to **60 seconds** if nothing can be parsed

The timeout on each hook is set to **650 seconds** (just over 10 minutes) to
cover the longest possible rate-limit windows.

---

## Customising the defaults

Open `scripts/rate_limit_watcher.py` and adjust the constants at the top:

```python
DEFAULT_WAIT_SECS = 60   # fallback when no reset time is found
MAX_WAIT_SECS     = 600  # safety ceiling — never wait longer than this
```

---

## Publishing to npm

```bash
# Bump the version in package.json first, then:
npm publish --access public
```

---

## Plugin structure

```
rate-limit-timer/
├── .claude-plugin/
│   └── plugin.json              ← plugin manifest
├── bin/
│   ├── cli.js                   ← npm CLI (install / uninstall / status)
│   └── postinstall.js           ← auto-install on npm install -g
├── hooks/
│   └── hooks.json               ← hook event wiring
├── scripts/
│   └── rate_limit_watcher.py    ← countdown logic
├── package.json
└── README.md
```

---

## License

MIT
