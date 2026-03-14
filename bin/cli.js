#!/usr/bin/env node
"use strict";

/**
 * claude-rate-limit-timer  —  CLI entry point
 *
 * Usage:
 *   claude-rate-limit-timer install [--scope user|project]
 *   claude-rate-limit-timer uninstall
 *   claude-rate-limit-timer status
 *
 * Instead of relying on `claude plugin install` (marketplace-only),
 * we write directly to Claude Code's settings.json using the
 * pluginDirectories field — the same mechanism as --plugin-dir.
 */

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

// ── constants ─────────────────────────────────────────────────────────────────

const PLUGIN_NAME = "rate-limit-timer";
const PLUGIN_ROOT = path.resolve(path.join(__dirname, ".."));

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function log(msg)  { process.stdout.write(msg + "\n"); }
function err(msg)  { process.stderr.write(C.red + msg + C.reset + "\n"); }
function ok(msg)   { log(C.green + "✅ " + msg + C.reset); }
function info(msg) { log(C.cyan  + "ℹ  " + msg + C.reset); }
function warn(msg) { log(C.yellow + "⚠  " + msg + C.reset); }

function settingsPathForScope(scope) {
  if (scope === "user") {
    return path.join(os.homedir(), ".claude", "settings.json");
  }
  // project scope: .claude/settings.json in cwd
  return path.join(process.cwd(), ".claude", "settings.json");
}

function readSettings(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function printUsage() {
  log(`
${C.bold}claude-rate-limit-timer${C.reset} — Claude Code rate-limit countdown plugin

${C.bold}Usage:${C.reset}
  claude-rate-limit-timer install [--scope <user|project>]
  claude-rate-limit-timer uninstall
  claude-rate-limit-timer status

${C.bold}Options:${C.reset}
  --scope user     Register for all projects (default)
  --scope project  Register only for the current project

${C.bold}Examples:${C.reset}
  claude-rate-limit-timer install
  claude-rate-limit-timer install --scope project
  claude-rate-limit-timer uninstall
`);
}

// ── commands ──────────────────────────────────────────────────────────────────

function cmdInstall(args) {
  const scopeIdx = args.indexOf("--scope");
  const scope = scopeIdx !== -1 ? args[scopeIdx + 1] : "user";

  if (!["user", "project"].includes(scope)) {
    err(`Unknown scope "${scope}". Use "user" or "project".`);
    process.exit(1);
  }

  const settingsPath = settingsPathForScope(scope);
  info(`Installing ${C.bold}${PLUGIN_NAME}${C.reset}${C.cyan} (scope=${scope}) …`);

  const settings = readSettings(settingsPath);

  if (!Array.isArray(settings.pluginDirectories)) {
    settings.pluginDirectories = [];
  }

  if (settings.pluginDirectories.includes(PLUGIN_ROOT)) {
    ok(`Plugin is already registered in ${settingsPath}`);
    return;
  }

  settings.pluginDirectories.push(PLUGIN_ROOT);
  writeSettings(settingsPath, settings);

  ok(`Plugin installed! Restart Claude Code to activate it.`);
  log(`\n  Registered: ${C.bold}${PLUGIN_ROOT}${C.reset}`);
  log(`  Settings:   ${settingsPath}`);
  log(`\n  To remove: ${C.bold}claude-rate-limit-timer uninstall${C.reset}\n`);
}

function cmdUninstall() {
  let removed = false;

  // check both scopes
  for (const scope of ["user", "project"]) {
    const settingsPath = settingsPathForScope(scope);
    const settings = readSettings(settingsPath);

    if (!Array.isArray(settings.pluginDirectories)) continue;

    const before = settings.pluginDirectories.length;
    settings.pluginDirectories = settings.pluginDirectories.filter(
      (d) => !d.includes(PLUGIN_NAME) && d !== PLUGIN_ROOT
    );

    if (settings.pluginDirectories.length < before) {
      writeSettings(settingsPath, settings);
      info(`Removed from ${settingsPath}`);
      removed = true;
    }
  }

  if (removed) {
    ok("Plugin uninstalled. Restart Claude Code to apply.");
  } else {
    warn(`Plugin not found in any settings file.`);
  }
}

function cmdStatus() {
  let found = false;

  for (const scope of ["user", "project"]) {
    const settingsPath = settingsPathForScope(scope);
    const settings = readSettings(settingsPath);

    if (
      Array.isArray(settings.pluginDirectories) &&
      (settings.pluginDirectories.includes(PLUGIN_ROOT) ||
        settings.pluginDirectories.some((d) => d.includes(PLUGIN_NAME)))
    ) {
      ok(`Plugin is installed (${scope} scope) — ${settingsPath}`);
      found = true;
    }
  }

  if (!found) {
    warn(`Plugin "${PLUGIN_NAME}" is not currently installed.`);
    info(`Run: claude-rate-limit-timer install`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

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
