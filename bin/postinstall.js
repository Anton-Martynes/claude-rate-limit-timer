#!/usr/bin/env node
"use strict";

/**
 * postinstall.js — runs automatically after `npm install -g claude-rate-limit-timer`
 *
 * Writes hooks directly into ~/.claude/settings.json.
 * Never fails loudly — always exits 0.
 */

const path = require("path");
const fs   = require("fs");
const os   = require("os");

const PLUGIN_NAME    = "rate-limit-timer";
const PLUGIN_ROOT    = path.resolve(path.join(__dirname, ".."));
const SCRIPT         = path.join(PLUGIN_ROOT, "scripts", "rate_limit_watcher.py");
const SETTINGS_PATH  = path.join(os.homedir(), ".claude", "settings.json");
const MARKER         = `# ${PLUGIN_NAME}`;

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
};

function log(msg) { process.stdout.write(msg + "\n"); }

function buildHookEntries() {
  const cmd = (hookType, timeout) => ({
    type: "command",
    command: `python3 "${SCRIPT}" ${hookType} ${MARKER}`,
    timeout,
  });
  return {
    SessionStart:       [{ hooks: [cmd("session_start", 10)]  }],
    Stop:               [{ hooks: [cmd("stop",          650)] }],
    Notification:       [{ hooks: [cmd("notification",  650)] }],
    PostToolUseFailure: [{ matcher: ".*", hooks: [cmd("failure", 650)] }],
  };
}

function isInstalled(settings) {
  if (!settings.hooks) return false;
  for (const entries of Object.values(settings.hooks)) {
    for (const entry of entries) {
      for (const h of entry.hooks || []) {
        if (typeof h.command === "string" && h.command.includes(MARKER)) return true;
      }
    }
  }
  return false;
}

log("");
log(`${C.bold}${C.cyan}claude-rate-limit-timer${C.reset} — Claude Code rate-limit countdown plugin`);
log("");

// Skip inside CI / npm pack / npm publish
if (["CI", "CONTINUOUS_INTEGRATION", "npm_config_dry_run"].some(v => process.env[v])) {
  log(`${C.yellow}ℹ  CI environment — skipping auto-install.${C.reset}`);
  log(`   Run ${C.bold}claude-rate-limit-timer install${C.reset} manually when ready.\n`);
  process.exit(0);
}

try {
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  }

  if (isInstalled(settings)) {
    log(`${C.green}✅ Plugin already registered.${C.reset} Restart Claude Code to make sure it's active.\n`);
    process.exit(0);
  }

  if (!settings.hooks) settings.hooks = {};

  for (const [event, newEntries] of Object.entries(buildHookEntries())) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    settings.hooks[event].push(...newEntries);
  }

  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");

  log(`${C.green}✅ Plugin installed!${C.reset} Restart Claude Code to activate it.\n`);
} catch (e) {
  log(`${C.yellow}⚠  Auto-install failed (this is okay).${C.reset}`);
  log(`   Finish setup manually: ${C.bold}claude-rate-limit-timer install${C.reset}\n`);
}
