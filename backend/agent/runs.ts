import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import type { EventList } from "./types.js";

const RUNS_DIR = fileURLToPath(new URL("../runs/", import.meta.url));

export type RunRecord = {
  runName: string;
  from: string;
  to: string;
  createdAt: string;
  events: EventList;
};

export function saveRun(run: RunRecord): string {
  mkdirSync(RUNS_DIR, { recursive: true });

  const file = join(RUNS_DIR, `${run.runName}.json`);
  writeFileSync(file, JSON.stringify(run, null, 2));
  return file;
}
