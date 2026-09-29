import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

let cached: string | undefined;

// The house style, read from disk on the server only and included in the prompts that judge copy.
export async function loadStyleGuide(): Promise<string> {
  cached ??= (await readFile(path.join(process.cwd(), "src", "content", "style-guide.md"), "utf8")).trim();
  return cached;
}
