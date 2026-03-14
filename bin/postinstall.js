#!/usr/bin/env node
"use strict";

/**
 * postinstall.js
 *
 * Runs automatically after `npm install -g claude-rate-limit-timer`.
 * Registers the plugin by writing directly to ~/.claude/settings.json
 * (pluginDirectories field). Never fails loudly — always exits 0.
 */

const path = require("path");
const fs   = require("fs");
const os   = require("os");

const PLUGIN_ROOT    = path.resolve(path.join(__dirname, ".."));
const SETTINGS_PATH  = path.join(os.homedir(), ".claude", "settings.json");

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
};

function log(msg) { process.stdout.write(msg + "\n"); }

log("");
log(`${C.bold}${C.cyan}claude-rate-limit-timer${C.reset} — Claude Code rate-limit countdown plugin`);
log("");

// Skip inside CI / npm pack / npm publish
const skipEnvs = ["CI", "CONTINUOUS_INTEGRATION", "npm_config_dry_run"];
if (skipEnvs.some(v => process.env[v])) {
  log(`${C.yellow}ℹ  CI environment — skipping auto-install.${C.reset}`);
  log(`   Run ${C.bold}claude-rate-limit-timer install${C.reset} manually when ready.\n`);
  process.exit(0);
}

try {
  // Read existing settings (create if missing)
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  }

  if (!Array.isArray(settings.pluginDirectories)) {
    settings.pluginDirectories = [];
  }

  if (settings.pluginDirectories.includes(PLUGIN_ROOT)) {
    log(`${C.green}✅ Plugin already registered.${C.reset} Restart Claude Code to make sure it's active.\n`);
    process.exit(0);
  }

  settings.pluginDirectories.push(PLUGIN_ROOT);
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");

  log(`${C.green}✅ Plugin installed successfully!${C.reset} Restart Claude Code to activate it.\n`);
} catch (e) {
  log(`${C.yellow}⚠  Auto-install failed (this is okay).${C.reset}`);
  log(`   Finish setup manually by running:`);
  log(`   ${C.bold}claude-rate-limit-timer install${C.reset}\n`);
  // exit 0 — never break the npm install chain
}
