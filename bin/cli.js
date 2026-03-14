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
 * Installs by writing hooks directly into Claude Code's settings.json —
 * the only reliable mechanism that doesn't require a marketplace.
 */

const path = require("path");
const fs   = require("fs");
const os   = require("os");

// ── constants ─────────────────────────────────────────────────────────────────

const PLUGIN_NAME  = "rate-limit-timer";
const PLUGIN_ROOT  = path.resolve(path.join(__dirname, ".."));
const SCRIPT       = path.join(PLUGIN_ROOT, "scripts", "rate_limit_watcher.py");

// Marker comment written into each hook command so we can find and remove them
const MARKER = `# ${PLUGIN_NAME}`;

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
  return scope === "user"
    ? path.join(os.homedir(), ".claude", "settings.json")
    : path.join(process.cwd(), ".claude", "settings.json");
}

function readSettings(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return {}; }
}

function writeSettings(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Build the four hook entries we inject into settings.json */
function buildHookEntries() {
  const cmd = (hookType, timeout) => ({
    type: "command",
    command: `python3 "${SCRIPT}" ${hookType} ${MARKER}`,
    timeout,
  });

  return {
    SessionStart: [{ hooks: [cmd("session_start", 10)] }],
    Stop:         [{ hooks: [cmd("stop",          650)] }],
    Notification: [{ hooks: [cmd("notification",  650)] }],
    PostToolUseFailure: [{ matcher: ".*", hooks: [cmd("failure", 650)] }],
  };
}

/** Returns true if any of our hooks are already present in settings */
function isInstalled(settings) {
  if (!settings.hooks) return false;
  for (const entries of Object.values(settings.hooks)) {
    for (const entry of entries) {
      for (const h of entry.hooks || []) {
        if (typeof h.command === "string" && h.command.includes(MARKER)) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Remove all hook entries that carry our MARKER */
function removeOurHooks(hooks) {
  const result = {};
  for (const [event, entries] of Object.entries(hooks)) {
    const filtered = entries
      .map((entry) => ({
        ...entry,
        hooks: (entry.hooks || []).filter(
          (h) => !(typeof h.command === "string" && h.command.includes(MARKER))
        ),
      }))
      .filter((entry) => entry.hooks.length > 0);
    if (filtered.length > 0) result[event] = filtered;
  }
  return result;
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
  const scope    = scopeIdx !== -1 ? args[scopeIdx + 1] : "user";

  if (!["user", "project"].includes(scope)) {
    err(`Unknown scope "${scope}". Use "user" or "project".`);
    process.exit(1);
  }

  const settingsPath = settingsPathForScope(scope);
  info(`Installing ${C.bold}${PLUGIN_NAME}${C.reset}${C.cyan} (scope=${scope}) …`);

  const settings = readSettings(settingsPath);

  if (isInstalled(settings)) {
    ok(`Already installed in ${settingsPath}`);
    return;
  }

  if (!settings.hooks) settings.hooks = {};

  const entries = buildHookEntries();
  for (const [event, newEntries] of Object.entries(entries)) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    settings.hooks[event].push(...newEntries);
  }

  writeSettings(settingsPath, settings);

  ok(`Plugin installed! Restart Claude Code to activate it.`);
  log(`\n  Settings: ${settingsPath}`);
  log(`  Script:   ${SCRIPT}`);
  log(`\n  To remove: ${C.bold}claude-rate-limit-timer uninstall${C.reset}\n`);
}

function cmdUninstall() {
  let removed = false;

  for (const scope of ["user", "project"]) {
    const settingsPath = settingsPathForScope(scope);
    const settings     = readSettings(settingsPath);

    if (!settings.hooks || !isInstalled(settings)) continue;

    settings.hooks = removeOurHooks(settings.hooks);
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    writeSettings(settingsPath, settings);
    info(`Removed from ${settingsPath}`);
    removed = true;
  }

  if (removed) {
    ok("Plugin uninstalled. Restart Claude Code to apply.");
  } else {
    warn("Plugin is not currently installed.");
  }
}

function cmdStatus() {
  let found = false;

  for (const scope of ["user", "project"]) {
    const settingsPath = settingsPathForScope(scope);
    const settings     = readSettings(settingsPath);

    if (isInstalled(settings)) {
      ok(`Installed (${scope} scope) — ${settingsPath}`);
      found = true;
    }
  }

  if (!found) {
    warn(`Plugin "${PLUGIN_NAME}" is not installed.`);
    info(`Run: claude-rate-limit-timer install`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

const [, , command, ...rest] = process.argv;

switch (command) {
  case "install":   cmdInstall(rest); break;
  case "uninstall": cmdUninstall();   break;
  case "status":    cmdStatus();      break;
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
