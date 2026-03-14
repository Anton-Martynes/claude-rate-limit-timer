#!/usr/bin/env node
"use strict";

/**
 * postinstall.js
 *
 * Runs automatically after `npm install -g claude-rate-limit-timer`.
 * Tries to install the Claude Code plugin; if claude isn't in PATH or the
 * install fails for any reason, it falls back to printing clear instructions
 * so the user can finish setup manually — it never fails loudly.
 */

const { spawnSync, execSync } = require("child_process");
const path = require("path");

const PLUGIN_ROOT = path.join(__dirname, "..");
const PLUGIN_NAME = "rate-limit-timer";

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
};

function log(msg) { process.stdout.write(msg + "\n"); }

function claudeAvailable() {
  const r = spawnSync("claude", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

log("");
log(
  `${C.bold}${C.cyan}claude-rate-limit-timer${C.reset} — ` +
  `Claude Code rate-limit countdown plugin`
);
log("");

// Skip auto-install inside CI / during `npm pack` / `npm publish`
const skipEnvs = ["CI", "CONTINUOUS_INTEGRATION", "npm_config_dry_run"];
if (skipEnvs.some(v => process.env[v])) {
  log(`${C.yellow}ℹ  CI environment detected — skipping auto-install.${C.reset}`);
  log(
    `   Run ${C.bold}claude-rate-limit-timer install${C.reset} ` +
    `manually when ready.\n`
  );
  process.exit(0);
}

if (!claudeAvailable()) {
  log(`${C.yellow}⚠  Claude Code CLI not found in PATH.${C.reset}`);
  log(`   Install it from https://claude.ai/download, then run:`);
  log(`   ${C.bold}claude-rate-limit-timer install${C.reset}\n`);
  process.exit(0);   // never fail — postinstall errors break npm install
}

log(`   Attempting automatic plugin installation …`);

try {
  execSync(
    `claude plugin install "${PLUGIN_ROOT}" --scope user`,
    { stdio: "pipe" }
  );
  log(
    `${C.green}✅ Plugin installed successfully!${C.reset} ` +
    `Restart Claude Code to activate it.\n`
  );
} catch (e) {
  log(`${C.yellow}⚠  Auto-install failed (this is okay).${C.reset}`);
  log(`   Finish setup manually by running:`);
  log(`   ${C.bold}claude-rate-limit-timer install${C.reset}\n`);
  // still exit 0 — don't break the npm install chain
}
