## 2026-11-18: Build the agent without an LLM framework

**Context:** I want an agent that finds Berlin events for a date range and returns them as a structured list.

**Decision:** Plain TypeScript, two tools:

- `web_search` — Tavily search, broad queries first, then narrower ones.
- `event_format` — validates the final event list; always the last call.

**Why:** I wanted to learn how an agent works under the hood, so I skipped frameworks like LangChain.

## 2026-11-20: Move the agent to LangChain

**Context:** The plain TypeScript agent works, but I want to build a more
complex agent. In the plain version I wrote everything by hand: the loop,
the turn limit, tool dispatch, output validation, error handling and logging.
Adding more features would make `agent.ts` harder to manage.

**Decision:** Rewrite the agent with LangChain (`createAgent`).

**Why:**

- LangChain already has the pieces I built by hand, so I can focus on the agent's behavior instead of the loop.
- I want to learn a framework that is used in real projects.
