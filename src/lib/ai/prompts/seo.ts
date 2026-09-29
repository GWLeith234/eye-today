// Prompt text only. No network, no secrets.
export const PROMPT_VERSION = "seo-1";

export const PROMPT = `Task: write an SEO title and an SEO description for the article.
- seo_title: at most 120 characters, plain text, faithful to the article.
- seo_description: at most 320 characters, plain text, one or two sentences, no quotation marks around the whole thing.
- Return them as "seo_title" and "seo_description".`;
