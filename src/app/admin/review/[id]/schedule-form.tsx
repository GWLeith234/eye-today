"use client";

import { useState } from "react";

import { approveAndSchedule } from "../actions";

// Converts the local date/time to an ISO timestamp before the server action runs.
export function ScheduleForm({ id }: { id: string }) {
  const [local, setLocal] = useState("");
  return (
    <form action={approveAndSchedule} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="scheduled_for" value={local ? new Date(local).toISOString() : ""} />
      <label className="flex flex-col gap-1 text-sm">
        Publish at
        <input type="datetime-local" required value={local} onChange={(e) => setLocal(e.target.value)} className="rounded border px-2 py-1" />
      </label>
      <button type="submit" className="rounded border px-3 py-1">Approve &amp; schedule</button>
    </form>
  );
}
