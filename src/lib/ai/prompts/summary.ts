// Prompt text only. No network, no secrets.
export const PROMPT_VERSION = "summary-1";

export const PROMPT = `Task: write 3 to 5 key points summarising the article for a reader in a hurry.
- Each point is at most 200 characters, plain text, one sentence.
- Only say what the article says. Follow the house style below; never add dosing or how-to detail.
- Return them as "points".`;
