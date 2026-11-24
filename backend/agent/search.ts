import { tavily } from "@tavily/core";
import { debug, errorMessage, log, timer } from "./logger.js";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
if (!TAVILY_API_KEY) {
  throw Error("TAVILY_API_KEY is not set.");
}

const tavilyClient = tavily({ apiKey: TAVILY_API_KEY });

export async function webSearch(query: string): Promise<string> {
  const elapsed = timer();

  let response;
  try {
    response = await tavilyClient.search(query, {
      maxResults: 5,
      // chunksPerSource: 1,
      // searchDepth: "advanced",
      // includeRawContent: "markdown",
      includeDomains: ["visitberlin.de", "berlin.de"],
      includeDomainsMode: "prefer",
      // excludeDomains: ["eventbrite.com", "eventcartel.com", "ticketmaster.de"],
    });
  } catch (e) {
    log("search_error", { query, error: errorMessage(e), tookMs: elapsed() });
    throw e; // the caller (agent.ts) turns this into a message for the model
  }

  const searchResultArray = response.results.map((item) => ({
    title: item.title,
    url: item.url,
    content: item.content,
  }));

  // results=0 is worth noticing: the model gets nothing to work with.
  log("search_done", {
    query,
    results: searchResultArray.length,
    urls: searchResultArray.map((r) => r.url),
    tookMs: elapsed(),
  });
  // The full titles and text snippets: log file only (or LOG_LEVEL=debug).
  debug("search_results", searchResultArray);

  return JSON.stringify(searchResultArray);
}
