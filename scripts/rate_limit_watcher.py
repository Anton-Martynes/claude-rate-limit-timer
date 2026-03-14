#!/usr/bin/env python3
"""
rate_limit_watcher.py — Claude Code rate-limit countdown plugin

Triggered by Claude Code hooks (Stop, Notification, PostToolUseFailure).
Detects rate-limit events, shows a live countdown timer, then signals
Claude Code to continue the interrupted command.

Usage (handled automatically by hooks.json):
  python3 rate_limit_watcher.py <hook_type>
  hook_type: stop | notification | failure
"""

import sys
import json
import re
import time
import os
import signal
from datetime import datetime, timezone

# ── ANSI colours ──────────────────────────────────────────────────────────────
RESET   = "\033[0m"
BOLD    = "\033[1m"
RED     = "\033[31m"
YELLOW  = "\033[33m"
GREEN   = "\033[32m"
CYAN    = "\033[36m"
MAGENTA = "\033[35m"
CLEAR_LINE = "\033[2K\r"

# ── Rate-limit fingerprints ───────────────────────────────────────────────────
RATE_LIMIT_PATTERNS = [
    r"rate[_\s\-]?limit",
    r"429",
    r"too many requests",
    r"request rate",
    r"quota exceeded",
    r"overloaded",
    r"capacity",
    r"cooldown",
    r"please wait",
    r"retry[_\s\-]?after",
    r"x-ratelimit",
]

DEFAULT_WAIT_SECS = 60   # fallback if we can't parse a reset time
MAX_WAIT_SECS     = 600  # safety ceiling

# ── Encouraging messages (one printed every 60 s while waiting) ───────────────
ENCOURAGING_MESSAGES = [
    "☕  Perfect time for a coffee break — you've earned it.",
    "💪  Great work so far. Claude will be back before you know it.",
    "🌟  Every expert was once a beginner. Keep going!",
    "🚀  Big things take time. Your code is worth the wait.",
    "🎯  Stay focused — you're closer to done than you think.",
    "🧠  While we wait: the best code is code that ships. Almost there!",
    "🌈  Rate limits are just speed bumps, not stop signs.",
    "🔥  You're on fire today. The API just needs a moment to catch up.",
    "⚡  Good things come to those who wait (and code well).",
    "🎉  Fun fact: the first computer bug was an actual moth. Your bugs are classier.",
    "🌊  Breathe. The API ocean is refilling its waves.",
    "🏆  Champions wait for rate limits too. You're in good company.",
    "🎸  If coding were easy, everyone would do it. You've got this.",
    "🦾  Your patience is a feature, not a bug.",
    "💡  Use this minute to think about your next move — best code starts in the mind.",
    "🌙  Even the fastest rockets have to wait on the launchpad sometimes.",
    "🍀  Luck is what happens when preparation meets opportunity. Keep preparing!",
    "🎨  Good software is like good art — it takes time to get right.",
    "🤖  Claude is recharging its neurons. It'll be sharper than ever.",
    "📈  Every line of code you write is a step toward mastery. Keep stepping.",
]

# ── Les Podervianskyi-style session-start taunts ──────────────────────────────
# Shown at session start when the rate limit hasn't been hit yet.
# Inspired by the sardonic, absurdist, fearlessly provocative spirit of
# the great Ukrainian playwright Lес Подерв'янський.
PODORVIANSKYI_MESSAGES = [
    "Слухай, ти ще навіть не накосячив по-справжньому. Що це за робота взагалі?",
    "Ти ще не впер у ліміти? Або ти геній, або ти ще не починав. З тебе видно, що друге.",
    "Ліміти ще чисті, як твоя совість перед дедлайном. Насолоджуйся, бо надовго не вистачить.",
    "О, новий день, новий клоун перед терміналом. Вперед, синку. Ліміти самі себе не з'їдять.",
    "Ти ще не вгатив у rate limit? Ганьба. Серйозні люди роблять це до обіду.",
    "Привіт, трудівнику. Ліміти поки що нетронуті. Це або добре, або дуже підозріло.",
    "Знаєш, я бачив людей, які писали код. Деякі навіть доводили до rate limit. Ти поки що не з них.",
    "Знову ти. Ну давай, давай. Ліміти не нескінченні, але терпіння в мене — взагалі ні.",
    "О, ти вирішив попрацювати. Хороша спроба. Подивимось, чи вистачить у тебе запалу до першого 429.",
    "Ліміти поки мовчать. Як і твій прогрес, схоже. Вперед, не соромся.",
    "Ти запустив сесію. Молодець. Тепер зроби щось, щоб API захотів від тебе відпочити.",
    "Усе тихо. Ліміти не тронуті. Або ти дуже акуратний, або ще нічого не зробив. Обидва варіанти — погані.",
    "Ну шо, знову кодити прийшов? Давай, я слідкую. Ліміти теж чекають свого зірного часу.",
    "Запам'ятай: rate limit — це не помилка. Це медаль за те, що ти хоча б щось робив.",
    "Добрий ранок. Або вечір. Або ніч. Ти виглядаєш однаково в будь-який час — злегка загублений.",
]


def _matches_rate_limit(text: str) -> bool:
    if not text:
        return False
    low = text.lower()
    return any(re.search(p, low) for p in RATE_LIMIT_PATTERNS)


def _extract_wait_seconds(data: dict, raw_text: str) -> int:
    """Best-effort extraction of how many seconds to wait."""

    # 1. Explicit numeric field from Claude Code internals
    for key in ("retry_after", "retryAfter", "reset_in", "resetIn",
                "wait_seconds", "waitSeconds", "seconds"):
        val = data.get(key)
        if val is not None:
            try:
                return max(1, int(float(str(val))))
            except (ValueError, TypeError):
                pass

    # 2. Unix timestamp "reset_at" / "reset_time"
    for key in ("reset_at", "resetAt", "reset_time", "resetTime"):
        val = data.get(key)
        if val:
            try:
                ts = int(float(str(val)))
                remaining = ts - int(time.time())
                if 0 < remaining < MAX_WAIT_SECS:
                    return remaining
            except (ValueError, TypeError):
                pass

    # 3. "retry after N seconds" / "wait N seconds" in any string in the payload
    pattern = re.compile(r"(?:retry[\s_\-]?after|wait|reset(?:s)? in)[^\d]*(\d+)\s*s", re.I)
    for text in [raw_text, json.dumps(data)]:
        m = pattern.search(text)
        if m:
            val = int(m.group(1))
            if 1 <= val <= MAX_WAIT_SECS:
                return val

    # 4. "in HH:MM:SS" or "in MM:SS"
    time_pat = re.compile(r"in\s+(?:(\d+):)?(\d{1,2}):(\d{2})", re.I)
    for text in [raw_text, json.dumps(data)]:
        m = time_pat.search(text)
        if m:
            h = int(m.group(1) or 0)
            mi = int(m.group(2))
            s  = int(m.group(3))
            total = h * 3600 + mi * 60 + s
            if 1 <= total <= MAX_WAIT_SECS:
                return total

    return DEFAULT_WAIT_SECS


def _bar(elapsed: int, total: int, width: int = 30) -> str:
    filled = int(width * elapsed / total) if total else 0
    pct    = int(100 * elapsed / total)   if total else 0
    bar    = "█" * filled + "░" * (width - filled)
    return f"[{bar}] {pct:3d}%"


def show_countdown(wait_secs: int) -> None:
    """Block, showing a live countdown in the terminal, then return."""
    import random
    total = wait_secs

    # Banner
    sys.stderr.write(
        f"\n{BOLD}{RED}⚡ Claude Code — Rate Limit Hit{RESET}\n"
        f"{YELLOW}   Waiting {total}s for the API quota to reset …{RESET}\n\n"
    )

    def _handle_sigint(sig, frame):
        sys.stderr.write(f"\n{YELLOW}⚠  Countdown interrupted by user.{RESET}\n")
        sys.exit(0)

    signal.signal(signal.SIGINT, _handle_sigint)

    messages = ENCOURAGING_MESSAGES[:]
    random.shuffle(messages)
    msg_index        = 0
    last_msg_at      = -1   # elapsed seconds when last message was printed

    start = time.monotonic()
    while True:
        elapsed   = time.monotonic() - start
        remaining = max(0, total - int(elapsed))

        # Print an encouraging message once per minute (at 0 s, 60 s, 120 s …)
        minute_mark = int(elapsed) // 60
        if minute_mark != last_msg_at:
            last_msg_at = minute_mark
            msg = messages[msg_index % len(messages)]
            msg_index += 1
            sys.stderr.write(f"\r{' ' * 70}\r")   # clear the timer line
            sys.stderr.write(f"{YELLOW}   {msg}{RESET}\n")
            sys.stderr.flush()

        mins, secs = divmod(remaining, 60)
        bar_str    = _bar(int(elapsed), total)

        line = (
            f"{CLEAR_LINE}"
            f"{CYAN}⏱  {BOLD}{mins:02d}:{secs:02d}{RESET}{CYAN} remaining  "
            f"{MAGENTA}{bar_str}{RESET}"
        )
        sys.stderr.write(line)
        sys.stderr.flush()

        if remaining <= 0:
            break
        time.sleep(0.25)

    sys.stderr.write(
        f"\n{BOLD}{GREEN}✅ Rate limit reset — resuming your command …{RESET}\n\n"
    )
    sys.stderr.flush()


def handle_stop(data: dict) -> None:
    """
    Hook: Stop
    Fired when Claude finishes a turn.  If the transcript or stop_reason
    indicates a rate-limit pause, count down and signal continuation.
    """
    stop_reason = data.get("stop_reason", "")
    transcript  = data.get("transcript", [])

    # Collect last few assistant messages to sniff for rate-limit language
    recent_text = ""
    for msg in reversed(transcript[-6:]):
        role    = msg.get("role", "")
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                (c.get("text") or c.get("input", {}).get("command") or "")
                for c in content if isinstance(c, dict)
            )
        if role == "assistant":
            recent_text += " " + str(content)

    raw = json.dumps(data)
    if not (_matches_rate_limit(stop_reason) or _matches_rate_limit(recent_text)):
        # Not a rate-limit stop — let Claude Code behave normally
        sys.exit(0)

    wait = _extract_wait_seconds(data, raw)
    show_countdown(wait)

    # Tell Claude Code to continue the interrupted task
    reply = {
        "continue": True,
        "prompt": (
            "The API rate limit has now reset. "
            "Please continue exactly where you left off."
        ),
    }
    print(json.dumps(reply))


def handle_notification(data: dict) -> None:
    """
    Hook: Notification
    Claude Code fires this for user-facing events; rate-limit notifications
    often arrive here with a `type` of "rate_limit" or similar.
    """
    notif_type = data.get("type", "")
    message    = data.get("message", "")
    raw        = json.dumps(data)

    if not (_matches_rate_limit(notif_type) or _matches_rate_limit(message)
            or _matches_rate_limit(raw)):
        sys.exit(0)

    wait = _extract_wait_seconds(data, raw)
    show_countdown(wait)

    reply = {
        "continue": True,
        "prompt": (
            "The API rate limit has now reset. "
            "Please continue exactly where you left off."
        ),
    }
    print(json.dumps(reply))


def handle_failure(data: dict) -> None:
    """
    Hook: PostToolUseFailure
    Catches tool-level 429 / overload errors and counts down.
    """
    error   = data.get("error", "")
    output  = data.get("tool_output", {})
    if isinstance(output, dict):
        error = error or output.get("error", "")
    raw = json.dumps(data)

    if not _matches_rate_limit(str(error) + raw):
        sys.exit(0)

    wait = _extract_wait_seconds(data, raw)
    show_countdown(wait)
    # For PostToolUseFailure we don't emit a continue signal —
    # Claude Code will automatically retry the tool after the hook returns.


def handle_session_start(_data: dict) -> None:
    """
    Hook: SessionStart
    Fires when a new session begins — before any rate limit has been hit.
    Greets the user with a sardonic Podervianskyi-style taunt.
    """
    import random
    msg = random.choice(PODORVIANSKYI_MESSAGES)
    sys.stderr.write(
        f"\n{BOLD}{MAGENTA}🎭  {msg}{RESET}\n\n"
    )
    sys.stderr.flush()


def main() -> None:
    hook_type = (sys.argv[1] if len(sys.argv) > 1 else "stop").lower()

    try:
        raw_stdin = sys.stdin.read()
        data = json.loads(raw_stdin) if raw_stdin.strip() else {}
    except json.JSONDecodeError:
        data = {}

    if hook_type == "stop":
        handle_stop(data)
    elif hook_type == "notification":
        handle_notification(data)
    elif hook_type == "failure":
        handle_failure(data)
    elif hook_type == "session_start":
        handle_session_start(data)
    else:
        # Unknown hook — do nothing
        sys.exit(0)


if __name__ == "__main__":
    main()
