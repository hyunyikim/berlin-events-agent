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

(async () => {
  const sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
  });
  sdk.start();

  startRun();
  const elapsed = timer();

  try {
    const result = await runAgent(new Date().toISOString().slice(0, 10));
    console.log("result", result);
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
