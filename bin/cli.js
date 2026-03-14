#!/usr/bin/env node
"use strict";

/**
 * claude-rate-limit-timer  —  CLI entry point
 *
 * Usage:
 *   claude-rate-limit-timer install [--scope user|project]
 *   claude-rate-limit-timer uninstall
 *   claude-rate-limit-timer status
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// ── helpers ──────────────────────────────────────────────────────────────────

const PLUGIN_NAME = "rate-limit-timer";
const PLUGIN_ROOT = path.join(__dirname, "..");

const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  cyan:    "\x1b[36m",
};

function log(msg)  { process.stdout.write(msg + "\n"); }
function err(msg)  { process.stderr.write(C.red + msg + C.reset + "\n"); }
function ok(msg)   { log(C.green + "✅ " + msg + C.reset); }
function info(msg) { log(C.cyan  + "ℹ  " + msg + C.reset); }
function warn(msg) { log(C.yellow + "⚠  " + msg + C.reset); }

function claudeAvailable() {
  const r = spawnSync("claude", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: "inherit", ...opts });
    return true;
  } catch {
    return false;
  }
}

function printUsage() {
  log(`
${C.bold}claude-rate-limit-timer${C.reset} — Claude Code rate-limit countdown plugin

${C.bold}Usage:${C.reset}
  claude-rate-limit-timer install [--scope <user|project>]
  claude-rate-limit-timer uninstall
  claude-rate-limit-timer status

${C.bold}Options:${C.reset}
  --scope user     Install for all projects (default)
  --scope project  Install only for the current project

${C.bold}Examples:${C.reset}
  claude-rate-limit-timer install
  claude-rate-limit-timer install --scope project
  claude-rate-limit-timer uninstall
`);
}

// ── commands ─────────────────────────────────────────────────────────────────

function cmdInstall(args) {
  // parse --scope flag
  const scopeIdx = args.indexOf("--scope");
  const scope = scopeIdx !== -1 ? args[scopeIdx + 1] : "user";

  if (!["user", "project"].includes(scope)) {
    err(`Unknown scope "${scope}". Use "user" or "project".`);
    process.exit(1);
  }

  if (!claudeAvailable()) {
    err("Claude Code CLI not found in PATH.");
    err("Please install it first: https://claude.ai/download");
    process.exit(1);
  }

  info(`Installing ${C.bold}${PLUGIN_NAME}${C.reset}${C.cyan} with scope=${scope} …`);

  const success = run(
    `claude plugin install "${PLUGIN_ROOT}" --scope ${scope}`
  );

  if (success) {
    ok(`Plugin installed! Restart Claude Code to activate it.`);
    log(`\n  To use: just start Claude Code — the plugin runs automatically.`);
    log(`  To remove: ${C.bold}claude-rate-limit-timer uninstall${C.reset}\n`);
  } else {
    err("Installation failed. Try running manually:");
    err(`  claude plugin install "${PLUGIN_ROOT}" --scope ${scope}`);
    process.exit(1);
  }
}

function cmdUninstall() {
  if (!claudeAvailable()) {
    err("Claude Code CLI not found in PATH.");
    process.exit(1);
  }

  info(`Uninstalling ${C.bold}${PLUGIN_NAME}${C.reset}${C.cyan} …`);
  const success = run(`claude plugin uninstall ${PLUGIN_NAME}`);

  if (success) {
    ok("Plugin uninstalled.");
  } else {
    err("Uninstall failed. Try running manually:");
    err(`  claude plugin uninstall ${PLUGIN_NAME}`);
    process.exit(1);
  }
}

function cmdStatus() {
  if (!claudeAvailable()) {
    warn("Claude Code CLI not found in PATH — cannot check status.");
    return;
  }

  // `claude plugin list` output contains the plugin name if installed
  try {
    const out = execSync("claude plugin list", { encoding: "utf8" });
    if (out.includes(PLUGIN_NAME)) {
      ok(`Plugin "${PLUGIN_NAME}" is installed.`);
    } else {
      warn(`Plugin "${PLUGIN_NAME}" does not appear to be installed.`);
      info(`Run: claude-rate-limit-timer install`);
    }
  } catch {
    warn("Could not retrieve plugin list. Run: claude plugin list");
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

const [, , command, ...rest] = process.argv;

switch (command) {
  case "install":
    cmdInstall(rest);
    break;
  case "uninstall":
    cmdUninstall();
    break;
  case "status":
    cmdStatus();
    break;
  case undefined:
  case "--help":
  case "-h":
    printUsage();
    break;
  default:
    err(`Unknown command: "${command}"`);
    printUsage();
    process.exit(1);
}
