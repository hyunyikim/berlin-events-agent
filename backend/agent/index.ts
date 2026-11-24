import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

import { runAgent } from "./agent.js";
import {
  debug,
  errorMessage,
  getLogFile,
  log,
  startRun,
  timer,
} from "./logger.js";
import { saveRun } from "./runs.js";

const ONE_DAY = 1000 * 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;

(async () => {
  const sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
  });
  sdk.start();

  const runName = startRun();
  const elapsed = timer();

  try {
    const today = new Date();

    // 7-day window from tomorrow, as YYYY-MM-DD in Berlin time
    const from = new Date(today.getTime() + ONE_DAY).toLocaleDateString(
      "en-CA",
      { timeZone: "Europe/Berlin" },
    );
    const to = new Date(today.getTime() + ONE_WEEK).toLocaleDateString(
      "en-CA",
      { timeZone: "Europe/Berlin" },
    );

    const result = await runAgent({
      from,
      to,
    });
    console.log("result", result);

    const runFile = saveRun({
      runName,
      from,
      to,
      createdAt: new Date().toISOString(),
      events: result,
    });
    log("run_saved", { path: runFile, events: result.length });
    log("log_file", { path: getLogFile() });
  } catch (e) {
    // The agent logs the details right before it throws; this line is the
    // one-line "the run failed, and here is why" at the very end.
    log("run_failed", { error: errorMessage(e), tookMs: elapsed() });
    // The stack trace goes to the log file (and to the console in debug mode).
    debug("run_failed_stack", e instanceof Error ? e.stack : String(e));
    log("log_file", { path: getLogFile() });
    process.exitCode = 1;
  } finally {
    await sdk.shutdown();
  }
})();
