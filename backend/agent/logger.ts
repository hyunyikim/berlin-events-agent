import { appendFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// A tiny logger used by every file in the agent.
//
// Every event is written to TWO places:
//   1. the console, as one short readable line (so you can follow along live)
//   2. a file, as one JSON object per line ("JSONL") (so you can search it later)
//
// Example console line:
//   12:01:05.480 [a1b2c3] llm_response turn=1 finish="tool_calls" took=2256ms
//
// Example file line (the same event):
//   {"ts":"2026-11-16T12:01:05.480Z","runId":"a1b2c3","event":"llm_response","turn":1,...}

type Fields = Record<string, unknown>;

// backend/logs/ (this file lives in backend/agent/, so "../logs/")
const LOG_DIR = fileURLToPath(new URL("../logs/", import.meta.url));

// Long values (like a whole web search result) are cut on the console so the
// lines stay readable. The log file always keeps the full value.
const MAX_CONSOLE_VALUE_LENGTH = 200;

// NOTE: these are module-level variables, so they only work when ONE run
// happens per process (which is how `pnpm agent` works today). If you ever run
// several agents at the same time in one server, you would pass the runId
// around instead (or use AsyncLocalStorage).
let runId = "no-run";
let logFile: string | undefined;

/** Call once at the start of a run. Creates the run id and the log file. */
export function startRun(): string {
  runId = randomUUID().slice(0, 6);

  try {
    mkdirSync(LOG_DIR, { recursive: true });
    // "2026-11-16T12:01:03.221Z" -> "2026-11-16T12-01-03" (":" is not nice in file names)
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    logFile = `${LOG_DIR}${stamp}-${runId}.jsonl`;
  } catch (e) {
    // Logging must never crash the agent. Fall back to console-only.
    logFile = undefined;
    console.warn(
      "Could not create the log folder, logging to console only:",
      e,
    );
  }

  return runId;
}

/** Where this run's log file is (undefined before startRun() is called). */
export function getLogFile(): string | undefined {
  return logFile;
}

/** Log one event, e.g. log("tool_done", { tool: "web_search", tookMs: 120 }). */
export function log(event: string, fields: Fields = {}): void {
  const now = new Date();
  writeToFile({ ts: now.toISOString(), runId, event, ...fields });

  const time = `${now.toTimeString().slice(0, 8)}.${String(now.getMilliseconds()).padStart(3, "0")}`;
  console.log(`${time} [${runId}] ${event}${formatFields(fields)}`);
}

/**
 * Log a big payload (a raw API response, a full search result, ...).
 * It always goes to the log file. It is only printed on the console when you
 * start the agent with LOG_LEVEL=debug, e.g. `LOG_LEVEL=debug pnpm agent`.
 */
export function debug(label: string, value: unknown): void {
  writeToFile({
    ts: new Date().toISOString(),
    runId,
    event: "debug",
    label,
    value,
  });

  if (process.env.LOG_LEVEL === "debug") {
    console.log(`[${runId}] debug ${label}:`);
    console.dir(value, { depth: null });
  }
}

/**
 * Start a stopwatch. Call the returned function to get the milliseconds since.
 *   const elapsed = timer();
 *   await somethingSlow();
 *   log("done", { tookMs: elapsed() });
 */
export function timer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

/** Turn anything thrown (Error, string, ...) into a message string. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function writeToFile(entry: Fields): void {
  if (!logFile) return;
  try {
    appendFileSync(logFile, JSON.stringify(entry) + "\n");
  } catch {
    // Ignore: a broken log file must not break the agent.
  }
}

// { a: 1, b: "x" }  ->  ' a=1 b="x"'
function formatFields(fields: Fields): string {
  let out = "";
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    // Times read nicer on the console: tookMs=120 -> took=120ms
    // (the log file keeps the original key, tookMs)
    if (key.endsWith("Ms") && typeof value === "number") {
      out += ` ${key.slice(0, -2)}=${value}ms`;
    } else {
      out += ` ${key}=${formatValue(value)}`;
    }
  }
  return out;
}

function formatValue(value: unknown): string {
  const text =
    typeof value === "string"
      ? JSON.stringify(value)
      : (JSON.stringify(value) ?? String(value));
  return text.length > MAX_CONSOLE_VALUE_LENGTH
    ? `${text.slice(0, MAX_CONSOLE_VALUE_LENGTH)}…(${text.length} chars)`
    : text;
}
