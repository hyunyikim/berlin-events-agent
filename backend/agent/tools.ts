import { tool } from "langchain";
import * as z from "zod";

import { EventListSchema } from "./types.js";
import { webSearch } from "./search.js";

export const webSearchTool = tool((input) => webSearch(input.query), {
  name: "web_search",
  description:
    "Search the web for current information such as events, news and prices. Return titles, URLs and text snippets. Use short, specific queries with dates; search in the local language for local topics.",
  schema: z.object({
    query: z
      .string()
      .describe(
        "The search query. Keep it short and specific, and include the date or month, e.g. 'Konzerte Berlin November 2026'. Use German for Berlin-specific topics.",
      ),
  }),
});

export const EventFormatSchema = z.object({ events: EventListSchema }).meta({
  title: "event_format",
  description:
    "When you're done searching, call this tool with the events. Call only after all searches are finished, and never in the same turn as a search.",
});
