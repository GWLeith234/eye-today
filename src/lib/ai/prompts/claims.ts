// Prompt text only. No network, no secrets.
export const PROMPT_VERSION = "claims-1";

export const PROMPT = `Task: find sentences in the article that make a claim needing a source, and flag them for the editor.
- Return up to 20 items. Each item has "sentence" (copied from the article), "kind" and "reason".
- kind is "medical" (health, treatment, safety or cure claims), "legal" (legal status, legislation, court outcomes) or "statistic" (figures, rates, percentages, study results).
- Flag any claim that a substance or treatment cures, treats or prevents a condition when the article names no source for it. For example, "ibogaine cures addiction" is an unsourced medical claim and must be flagged as medical.
- Also flag legal status stated without naming a jurisdiction, and any dosing or how-to instructions.
- "reason" is one short sentence saying what is missing. Plain text only. Never use the characters < or >.
- Do not judge whether a claim is true. Flag what lacks a named source.`;
