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

## 2026-11-22: Add Langfuse for tracing

**Context:** To check the agent's steps and results, I had to read through `.jsonl` log files by hand. This made it hard to review a run and see what to improve.

**Decision:** Add Langfuse for tracing. Traffic is low for now, so I use Langfuse Cloud on the free plan.

**Why:**

- Langfuse is open source, so if traffic grows, I can self-host it on my own server.
