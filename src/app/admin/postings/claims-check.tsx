"use client";

import { useState, useTransition } from "react";

import { checkPostingClaims, type ClaimFlag } from "./actions";

export function ClaimsCheck({ id }: { id: string }) {
  const [items, setItems] = useState<ClaimFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-labelledby="claims-check" className="flex flex-col gap-2 border border-rule p-3 text-sm">
      <h2 id="claims-check" className="font-semibold">Claims check</h2>
      <p className="text-muted">Asks the assistant to flag unsourced medical, legal or statistical claims and any dosing. Nothing is stored or changed.</p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await checkPostingClaims(id);
            if (result.ok) {
              setItems(result.items);
              setError(null);
            } else {
              setError(result.error);
            }
          })
        }
        className="self-start rounded border border-rule px-3 py-1 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Check claims"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {items && items.length === 0 ? <p role="status">Nothing flagged.</p> : null}
      {items && items.length > 0 ? (
        <ul className="flex flex-col gap-2" role="status">
          {items.map((item, index) => (
            <li key={index} className="border-l-4 border-accent pl-2">
              <p className="font-semibold">{item.kind}: “{item.sentence}”</p>
              <p>{item.reason}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
