// Prompt text only. No network, no secrets.
export const PROMPT_VERSION = "tags-1";

export const PROMPT = `Task: choose tags for the article from the list of allowed tag slugs given after the article.
- Return only slugs that appear exactly in that list. Do not invent slugs or rename them.
- Choose at most 6, most relevant first. Return an empty array if none fit.
- Return them as "slugs".`;
