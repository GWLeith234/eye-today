import { createHash } from "node:crypto";

// Auditable draw: entries are ordered by id, and the winner is sha256(seed) mod n. Anyone holding the seed and the
// entry list can repeat it and get the same winner. No server-only import: the tests load this file.
export function drawIndex(seedHex: string, count: number): number {
  if (!/^[0-9a-f]{64}$/.test(seedHex)) throw new Error("seed must be 64 lowercase hex characters");
  if (!Number.isInteger(count) || count < 1) throw new Error("need at least one entry");
  const digest = createHash("sha256").update(Buffer.from(seedHex, "hex")).digest("hex");
  return Number(BigInt(`0x${digest}`) % BigInt(count));
}

export function pickWinner<T extends { id: string }>(seedHex: string, entries: T[]): { winner: T; index: number; ordered: T[] } {
  const ordered = [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const index = drawIndex(seedHex, ordered.length);
  return { winner: ordered[index], index, ordered };
}

// RFC 4180: quote every field, double inner quotes. A leading = + - @ is prefixed with ' so spreadsheets don't run it.
export function csvField(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: (string | null)[][]): string {
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}
