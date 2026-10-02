import { COLORS, SANS, SERIF } from "./templates/colors";

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Small self-contained pages for the token routes (confirm, unsubscribe). They answer the
// one-click POST as well as browsers, so they are plain HTML rather than site pages.
export function htmlResponse(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} — Eye Today</title></head><body style="margin:0;background:${COLORS.paper};color:${COLORS.ink};font-family:${SANS}"><main style="max-width:32rem;margin:0 auto;padding:2.5rem 1rem"><p style="font-family:${SERIF};font-size:1.75rem;font-weight:700;margin:0 0 1.5rem"><a href="/" style="color:inherit;text-decoration:none">Eye Today</a></p><h1 style="font-family:${SERIF};font-size:1.75rem;margin:0 0 1rem">${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}

export const buttonHtml = (label: string) =>
  `<button type="submit" style="background:${COLORS.accent};color:#fff;border:0;border-radius:4px;padding:.75rem 1.25rem;font-size:1rem;cursor:pointer">${escapeHtml(label)}</button>`;

export const paragraph = (text: string) => `<p style="font-size:1.05rem;line-height:1.6">${escapeHtml(text)}</p>`;
