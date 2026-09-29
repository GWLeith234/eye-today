// Prompt text only. No network, no secrets.
export const PROMPT_VERSION = "copy-edit-1";

export const PROMPT = `Task: copy edit the article for grammar, spelling, clarity and house style (given below).
- Return up to 20 items. Each item has "quote", "suggestion" and "reason".
- "quote" must be copied character for character from the article text, once, and be short (a phrase or one sentence at most).
- "suggestion" is the replacement text for exactly that quote. "reason" is one short sentence.
- Plain text only. Never use the characters < or >.
- Do not rewrite for style alone. If the text needs no changes, return an empty array.`;
