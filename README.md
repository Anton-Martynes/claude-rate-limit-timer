# claude-rate-limit-timer

> A Claude Code plugin that handles API rate limits so you don't have to.

When Claude Code hits a rate limit mid-task, this plugin takes over: it shows
a live countdown timer, prints an encouraging message every minute while you
wait, and automatically resumes your command the moment the quota resets —
no babysitting required.

As a bonus, it greets every new session with a sardonic taunt in the spirit of
the legendary Ukrainian playwright **Лесь Подерв'янський**.

```
🎭  Ти ще не вгатив у rate limit? Ганьба. Серйозні люди роблять це до обіду.

... (you get to work) ...

⚡ Claude Code — Rate Limit Hit
   Waiting 300s for the API quota to reset …

   🚀  Big things take time. Your code is worth the wait.
⏱  04:12 remaining  [██████░░░░░░░░░░░░░░░░░░░░░░░░]  30%

   🏆  Champions wait for rate limits too. You're in good company.
⏱  03:11 remaining  [████████████░░░░░░░░░░░░░░░░░░]  46%

✅ Rate limit reset — resuming your command …
```

---

## Requirements

- [Claude Code](https://claude.ai/download) installed and in your PATH
- Node.js 16+
- Python 3.7+ (pre-installed on macOS and most Linux distros)

No additional npm or Python packages needed.

---

## Installation

```bash
npm install -g claude-rate-limit-timer
```

The postinstall script will try to register the plugin with Claude Code
automatically. If it succeeds, restart Claude Code and you're done.

If auto-install is skipped (e.g. Claude Code wasn't in PATH at install time),
run once:

```bash
claude-rate-limit-timer install
```

### Other CLI commands

```bash
# Install for the current project only
claude-rate-limit-timer install --scope project

# Check if the plugin is registered
claude-rate-limit-timer status

# Remove the plugin
claude-rate-limit-timer uninstall
```

### Manual installation (no npm)

```bash
# All projects (permanent)
claude plugin install /path/to/rate-limit-timer --scope user

# Current project only
claude plugin install /path/to/rate-limit-timer --scope project

# Current session only
claude --plugin-dir /path/to/rate-limit-timer
```

---

## What it does

The plugin hooks into three Claude Code events:

**`SessionStart`** — fires when you open a new session. Prints a random
Podervianskyi-style taunt before you've even hit a limit. Consider it a warmup.

**`Stop`** — fires when Claude finishes a response. If the transcript shows
signs of a rate limit, the countdown starts automatically and Claude is
signalled to continue once the quota resets.

**`PostToolUseFailure`** — fires when a tool call returns an error. Catches
429 / overload errors mid-task, waits out the limit, then lets Claude Code
retry automatically.

**`Notification`** — fires on Claude Code UI notifications. Catches rate-limit
notifications surfaced by Claude Code itself.

To figure out how long to wait, the plugin tries (in order): an explicit
`retry_after` / `reset_at` field in the payload, a Unix timestamp, a
"retry after N seconds" pattern in the error text, or a MM:SS countdown in the
message. If none of those match it defaults to **60 seconds**.

---

## Configuration

To change the default wait time or the maximum, open
`scripts/rate_limit_watcher.py` and edit the two constants near the top:

```python
DEFAULT_WAIT_SECS = 60   # used when no reset time can be parsed
MAX_WAIT_SECS     = 600  # hard ceiling — never waits longer than this
```

---

## License

MIT
