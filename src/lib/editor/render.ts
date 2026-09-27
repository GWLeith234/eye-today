import "server-only";

import { getSchema, type JSONContent } from "@tiptap/core";
import { generateHTML } from "@tiptap/html/server";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { editorExtensions } from "./extensions";
import { sanitizeArticleHtml } from "./sanitize";

const schema = getSchema(editorExtensions);

export type TiptapDoc = JSONContent & { type: "doc" };

// Throws if the JSON is not a document the editor schema can represent.
export function validateArticleJson(json: unknown): TiptapDoc {
  if (!json || typeof json !== "object" || (json as { type?: unknown }).type !== "doc") {
    throw new Error("body_json must be a doc");
  }
  ProseMirrorNode.fromJSON(schema, json).check();
  return json as TiptapDoc;
}

// body_json -> HTML with the same extensions as the editor -> sanitized.
// This is the only HTML ever stored in body_html.
export function renderArticleHtml(json: unknown): string {
  const doc = validateArticleJson(json);
  return sanitizeArticleHtml(generateHTML(doc, editorExtensions));
}
