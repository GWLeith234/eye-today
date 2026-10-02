// Prompt text only. No network, no secrets.
export const PROMPT_VERSION = "newsletter-intro-1";

export const PROMPT = `Task: write the short intro for an email newsletter issue, based on the list of stories in the article block.
- 2 to 4 sentences, at most 600 characters, plain text with no markdown, no lists and no greeting line.
- Warm and plain. Say what this issue covers and why a reader might care. Do not invent facts that are not in the story titles and deks.
- Never give dosing, preparation or how-to instructions for ibogaine or any other psychedelic. Do not call any substance legal or illegal without naming the place.
- Return it as "intro".`;
