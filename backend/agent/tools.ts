import * as z from "zod";

import { ChatFunctionTool } from "@openrouter/sdk/models";
import { EventList, EventListSchema } from "./types.js";
import { debug, log } from "./logger.js";

export const webSearchTool: ChatFunctionTool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web for current information such as events, news and prices. Return titles, URLs and text snippets. Use short, specific queries with dates; search in the local language for local topics.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query. Keep it short and specific, and include the date or month, e.g. 'Konzerte Berlin November 2026'. Use German for Berlin-specific topics.",
        },
      },
      required: ["query"],
    },
  },
};

export const eventFormatTool: ChatFunctionTool = {
  type: "function",
  function: {
    name: "event_format",
    description:
      "When you're done searching, call this tool with the events. Call only after all searches are finished, and never in the same turn as a search.",
    parameters: {
      type: "object",
      properties: {
        data: z.toJSONSchema(EventListSchema),
      },
      required: ["data"],
    },
  },
};

export function parseEventData(rawData: unknown) {
  const { data, success, error } = EventListSchema.safeParse(rawData);

  if (success) {
    log("parse_ok", { events: data.length });
    return data as EventList;
  }

  // The model gets the full error message (so it can fix its data).
  // The log gets a short version: how many problems, and the first few.
  log("parse_failed", {
    issues: error.issues.length,
    first: error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`),
  });
  debug("parse_failed_raw_data", rawData);
  throw Error(`Data isn't well structured: ${error.message} `);
}
