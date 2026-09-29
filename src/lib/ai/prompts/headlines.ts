// Prompt text only. No network, no secrets.
export const PROMPT_VERSION = "headlines-1";

export const PROMPT = `Task: write 3 to 5 alternative headlines for the article.
- Each headline is at most 200 characters, plain text, in sentence case.
- Accurate to the article. No clickbait, no claims the article does not support.
- Return them in the "headlines" array, best first.`;
