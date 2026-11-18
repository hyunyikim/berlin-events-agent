import { OpenRouter } from "@openrouter/sdk";
import { webSearchTool, eventFormatTool, parseEventData } from "./tools.js";
import { ChatMessages, ChatToolMessage } from "@openrouter/sdk/models";
import { webSearch } from "./search.js";
import { EventList } from "./types.js";
import { debug, errorMessage, log, timer } from "./logger.js";
import { buildSystemPrompt } from "./prompt.js";

const MAX_TURNS = 8;
const MODEL = "deepseek/deepseek-v4.1-flash-1017";

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function agent(today: string): Promise<EventList> {
  const query = "Berlin events this week.";
  const messages: Array<ChatMessages> = [
    {
      role: "system",
      content: buildSystemPrompt(today),
    },
    {
      role: "user",
      content: query,
    },
  ];

  const runElapsed = timer();
  let totalTokens = 0;
  log("run_start", { query, model: MODEL, maxTurns: MAX_TURNS });

  let count = 0;
  while (true) {
    count += 1;

    if (count > MAX_TURNS) {
      log("max_turns_reached", { maxTurns: MAX_TURNS, totalTokens });
      throw new Error("Hit the max turns limit without a valid event list.");
    }

    log("turn_start", {
      turn: `${count}/${MAX_TURNS}`,
      messages: messages.length,
    });
    // The newest message (what the model is about to read): file / debug only.
    debug("last_message", messages[messages.length - 1]);

    // --- 1. Ask the model what to do next ---
    const llmElapsed = timer();
    let response;
    try {
      response = await openrouter.chat.send({
        chatRequest: {
          model: MODEL,
          messages,
          tools: [webSearchTool, eventFormatTool],
          maxCompletionTokens: 5000,
        },
      });
    } catch (e) {
      log("llm_error", {
        turn: count,
        error: errorMessage(e),
        tookMs: llmElapsed(),
      });
      throw e;
    }

    const choice = response.choices[0];
    const usage = response.usage; // can be missing, so every use below has "?"
    totalTokens += usage?.totalTokens ?? 0;
    const requestedTools = choice.message?.toolCalls?.map(
      (t) => t.function.name,
    );

    log("llm_response", {
      turn: count,
      finish: choice.finishReason,
      tools: requestedTools?.join(",") || "none",
      tokensIn: usage?.promptTokens,
      tokensOut: usage?.completionTokens,
      cost: usage?.cost ?? undefined,
      tookMs: llmElapsed(),
    });
    // The whole raw response: log file only (or LOG_LEVEL=debug).
    debug("llm_response_raw", response);

    messages.push(choice.message);

    const finishReason = choice.finishReason;

    if (finishReason !== "tool_calls") {
      const content = choice.message?.content;
      log("unexpected_finish", {
        turn: count,
        finish: finishReason,
        // What did the model say instead of calling a tool?
        contentPreview: typeof content === "string" ? content : undefined,
      });
      throw new Error(
        `Model ended without calling event_format: ${finishReason}`,
      );
    }

    const toolCalls = choice.message?.toolCalls;

    if (!toolCalls) {
      log("missing_tool_calls", { turn: count });
      throw new Error("finishReason was tool_calls but no toolCalls found");
    }

    // --- 2. Run every tool the model asked for (in parallel) ---
    let finalEvents: EventList | undefined;
    const toolCallsResult = await Promise.all(
      toolCalls.map(async (tool) => {
        const chatToolMessage = {
          role: "tool",
          toolCallId: tool.id,
        } as ChatToolMessage;

        // Tools run at the same time, so the callId tells their lines apart.
        const toolInfo = {
          turn: count,
          tool: tool.function.name,
          callId: tool.id,
        };
        const toolElapsed = timer();
        log("tool_start", { ...toolInfo, args: tool.function.arguments });

        try {
          if (tool.function.name === "web_search") {
            const webSearchResponse = await webSearch(
              JSON.parse(tool.function.arguments)?.query,
            );
            log("tool_done", {
              ...toolInfo,
              resultChars: webSearchResponse.length,
              tookMs: toolElapsed(),
            });
            return {
              ...chatToolMessage,
              content: webSearchResponse,
            };
          }
          if (tool.function.name === "event_format") {
            finalEvents = parseEventData(
              JSON.parse(tool.function.arguments)?.data,
            );
            log("tool_done", {
              ...toolInfo,
              events: finalEvents.length,
              tookMs: toolElapsed(),
            });
            return {
              ...chatToolMessage,
              content: "success",
            };
          }
          log("tool_unknown", toolInfo);
          return {
            ...chatToolMessage,
            content: `Unknown tool. ${tool.function.name}`,
          };
        } catch (e) {
          // The error is sent back to the model (so it can try again),
          // and logged here so that YOU can see it too.
          log("tool_error", {
            ...toolInfo,
            error: errorMessage(e),
            tookMs: toolElapsed(),
          });
          return {
            ...chatToolMessage,
            content: String(e),
          };
        }
      }),
    );
    debug("tool_results", toolCallsResult);

    // --- 3. Done? ---
    if (finalEvents) {
      log("run_done", {
        events: finalEvents.length,
        turns: count,
        totalTokens,
        tookMs: runElapsed(),
      });
      debug("final_events", finalEvents);
      return finalEvents;
    }

    messages.push(...toolCallsResult);
  }
}
