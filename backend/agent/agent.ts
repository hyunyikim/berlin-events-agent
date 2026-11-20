import {
  createAgent,
  createMiddleware,
  modelCallLimitMiddleware,
  toolCallLimitMiddleware,
  toolStrategy,
  ToolMessage,
} from "langchain";
import { ChatOpenRouter } from "@langchain/openrouter";

import { webSearchTool, EventFormatSchema } from "./tools.js";
import { EventList } from "./types.js";
import { debug, errorMessage, log, timer } from "./logger.js";
import { buildSystemPrompt } from "./prompt.js";

const MAX_TURNS = 10;
const WEB_SEARCH_TOOL_CALL_LIMIT = 10;
const MODEL = "deepseek/deepseek-v4.1-flash-1017";

const model = new ChatOpenRouter({
  model: MODEL,
  apiKey: process.env.OPENROUTER_API_KEY,
  maxTokens: 16000,
});

function createLoggingMiddleware() {
  let turn = 0;
  let totalTokens = 0;

  const middleware = createMiddleware({
    name: "Logging",
    wrapModelCall: async (request, handler) => {
      turn += 1;
      log("turn_start", {
        turn: `${turn}/${MAX_TURNS}`,
        messages: request.messages.length,
      });
      debug("last_message", request.messages[request.messages.length - 1]);

      const elapsed = timer();
      let response;
      try {
        response = await handler(request);
      } catch (e) {
        log("llm_error", { turn, error: errorMessage(e), tookMs: elapsed() });
        throw e;
      }

      const usage = response.usage_metadata;
      totalTokens += usage?.total_tokens ?? 0;
      log("llm_response", {
        turn,
        tools: response.tool_calls?.map((t) => t.name).join(",") || "none",
        tokensIn: usage?.input_tokens,
        tokensOut: usage?.output_tokens,
        tookMs: elapsed(),
      });
      debug("llm_response_raw", response);
      return response;
    },
    wrapToolCall: async (request, handler) => {
      const toolInfo = {
        turn,
        tool: request.toolCall.name,
        callId: request.toolCall.id,
      };
      const elapsed = timer();
      log("tool_start", { ...toolInfo, args: request.toolCall.args });

      try {
        const result = await handler(request);
        log("tool_done", { ...toolInfo, tookMs: elapsed() });
        return result;
      } catch (e) {
        // Send the error back to the model so it can try again.
        log("tool_error", {
          ...toolInfo,
          error: errorMessage(e),
          tookMs: elapsed(),
        });
        return new ToolMessage({
          content: String(e),
          tool_call_id: request.toolCall.id ?? "",
          name: request.toolCall.name,
          status: "error",
        });
      }
    },
  });

  return { middleware, stats: () => ({ turns: turn, totalTokens }) };
}

export async function runAgent(today: string): Promise<EventList> {
  const query = "Berlin events this week.";
  const runElapsed = timer();
  log("run_start", { query, model: MODEL, maxTurns: MAX_TURNS });

  const logging = createLoggingMiddleware();

  const eventsAgent = createAgent({
    model,
    tools: [webSearchTool],
    systemPrompt: buildSystemPrompt(today, WEB_SEARCH_TOOL_CALL_LIMIT),
    responseFormat: toolStrategy(EventFormatSchema),
    middleware: [
      modelCallLimitMiddleware({ runLimit: MAX_TURNS, exitBehavior: "error" }),
      toolCallLimitMiddleware({
        toolName: "web_search",
        runLimit: WEB_SEARCH_TOOL_CALL_LIMIT,
        exitBehavior: "continue",
      }),
      logging.middleware,
    ],
  });

  const result = await eventsAgent.invoke(
    { messages: [{ role: "user", content: query }] },
    { recursionLimit: 100 },
  );

  const events = result.structuredResponse?.events;
  if (!events) {
    const last = result.messages[result.messages.length - 1];
    log("unexpected_finish", {
      ...logging.stats(),
      contentPreview:
        typeof last?.content === "string" ? last.content : undefined,
    });
    throw new Error("Model ended without calling event_format");
  }

  log("run_done", {
    events: events.length,
    ...logging.stats(),
    tookMs: runElapsed(),
  });
  debug("final_events", events);
  return events;
}
