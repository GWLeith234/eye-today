"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  autoFill,
  draftIntro,
  type Fail,
  previewIssue,
  saveIssue,
  scheduleIssue,
  sendNow,
  sendTest,
  unscheduleIssue,
} from "../actions";

export type StoryOption = { id: string; title: string; section: string; live: boolean; sponsored: boolean };

type Issue = {
  id: string;
  listName: string;
  subject: string;
  preheader: string;
  intro: string;
  storyIds: string[];
  status: "draft" | "scheduled" | "sent";
  scheduledFor: string | null;
  sentAt: string | null;
};

type Stats = { delivered: number; opened: number; clicked: number; bounced: number };

const UNEXPECTED = "Something went wrong talking to the server. Try again.";
const button = "rounded border px-3 py-1.5 text-sm disabled:opacity-40";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function IssueBuilder({
  issue,
  stories,
  activeSubscribers,
  stats,
  mailConfigured,
  assistantConfigured,
}: {
  issue: Issue;
  stories: StoryOption[];
  activeSubscribers: number;
  stats: Stats;
  mailConfigured: boolean;
  assistantConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState(issue.subject);
  const [preheader, setPreheader] = useState(issue.preheader);
  const [intro, setIntro] = useState(issue.intro);
  const [storyIds, setStoryIds] = useState(issue.storyIds);
  const [scheduleAt, setScheduleAt] = useState(toLocalInput(issue.scheduledFor));
  const [testTo, setTestTo] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const sent = issue.status === "sent";
  const byId = new Map(stories.map((s) => [s.id, s]));
  const unselected = stories.filter((s) => s.live && !storyIds.includes(s.id));
  const payload = { id: issue.id, subject, preheader, intro, story_ids: storyIds };

  function run<T extends { ok: boolean }>(work: () => Promise<T>, done: (result: Extract<T, { ok: true }>) => string | void) {
    setNote(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) setNote({ ok: false, text: (result as unknown as Fail).error });
        else {
          const text = done(result as Extract<T, { ok: true }>);
          if (text) setNote({ ok: true, text });
        }
      } catch {
        setNote({ ok: false, text: UNEXPECTED });
      }
    });
  }

  function move(index: number, by: -1 | 1) {
    setStoryIds((ids) => {
      const next = [...ids];
      const target = index + by;
      if (target < 0 || target >= next.length) return ids;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const saveThen = async <T,>(after: () => Promise<T>): Promise<T | Fail> => {
    const saved = await saveIssue(payload);
    return saved.ok ? after() : saved;
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-5 p-6">
      <p className="text-sm">
        <Link href="/admin/newsletters" className="underline">Newsletters</Link> / {issue.listName}
      </p>
      <h1 className="text-2xl font-bold">{issue.subject}</h1>
      <p className="text-sm" role="status">
        Status: <strong>{issue.status}</strong>
        {issue.status === "scheduled" && issue.scheduledFor ? ` for ${new Date(issue.scheduledFor).toLocaleString()}` : ""}
        {sent && issue.sentAt ? ` on ${new Date(issue.sentAt).toLocaleString()}` : ""}
        {" · "}
        {activeSubscribers} active subscriber{activeSubscribers === 1 ? "" : "s"}
      </p>
      {!mailConfigured ? (
        <p role="status" className="rounded border border-yellow-600 p-2 text-sm">
          Email is not configured, so test sends and sends are off. You can still build and preview the issue.
        </p>
      ) : null}

      {sent ? (
        <section aria-label="Results" className="flex flex-col gap-1 rounded border p-3">
          <h2 className="font-semibold">Results</h2>
          <p className="text-sm">
            Delivered {stats.delivered} · Opened {stats.opened} · Clicked {stats.clicked} · Bounced {stats.bounced}
          </p>
          <p className="text-xs opacity-70">Opens are a count of tracking-pixel loads, not proof the message was read.</p>
        </section>
      ) : null}

      <fieldset disabled={sent || pending} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Subject
          <input value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} className="rounded border px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Preheader (the preview line in the inbox)
          <input value={preheader} maxLength={150} onChange={(e) => setPreheader(e.target.value)} className="rounded border px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Intro (plain text)
          <textarea value={intro} maxLength={2000} rows={5} onChange={(e) => setIntro(e.target.value)} className="rounded border px-3 py-2 text-base" />
        </label>
        <div>
          <button
            type="button"
            className={button}
            onClick={() =>
              run(() => draftIntro(payload), (r) => {
                setIntro(r.intro);
                return "Intro drafted. Edit it as you like, then save.";
              })
            }
          >
            Draft intro with the assistant
          </button>
          {!assistantConfigured ? <span className="ml-2 text-xs opacity-70">The assistant is not configured.</span> : null}
        </div>

        <section aria-label="Stories" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Stories ({storyIds.length})</h2>
            <button
              type="button"
              className={button}
              onClick={() => run(() => autoFill(issue.id), (r) => { setStoryIds(r.ids); return "Filled with the latest live stories."; })}
            >
              Auto-fill
            </button>
          </div>
          <ol className="flex flex-col gap-1">
            {storyIds.map((id, index) => {
              const story = byId.get(id);
              return (
                <li key={id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm">
                  <span>
                    {story?.title ?? "Unknown story"}
                    {story && !story.live ? <strong className="ml-2 text-red-700">Not live — remove before saving</strong> : null}
                  </span>
                  <span className="flex gap-1">
                    <button type="button" aria-label="Move up" className={button} onClick={() => move(index, -1)}>↑</button>
                    <button type="button" aria-label="Move down" className={button} onClick={() => move(index, 1)}>↓</button>
                    <button type="button" className={button} onClick={() => setStoryIds((ids) => ids.filter((x) => x !== id))}>Remove</button>
                  </span>
                </li>
              );
            })}
          </ol>
          <label className="flex flex-col gap-1 text-sm">
            Add a live story
            <select
              value=""
              onChange={(e) => e.target.value && setStoryIds((ids) => (ids.length < 20 ? [...ids, e.target.value] : ids))}
              className="rounded border px-2 py-1"
            >
              <option value="">Choose…</option>
              {unselected.map((s) => (
                <option key={s.id} value={s.id}>{s.title}{s.section ? ` (${s.section})` : ""}</option>
              ))}
            </select>
          </label>
          <p className="text-xs opacity-70">Only published stories, or scheduled stories whose time has passed, can be added.</p>
        </section>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={() => run(() => saveIssue(payload), () => { router.refresh(); return "Saved."; })}>Save</button>
          <button type="button" className={button} onClick={() => run(() => previewIssue(payload), (r) => { setPreview(r.html); })}>Preview</button>
        </div>

        <section aria-label="Send" className="flex flex-col gap-3 border-t pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              Test address
              <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} className="rounded border px-2 py-1" />
            </label>
            <button type="button" className={button} disabled={!mailConfigured || !testTo} onClick={() => run(() => sendTest(payload, testTo), () => `Test sent to ${testTo}.`)}>
              Send test
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              className={`${button} bg-foreground text-background`}
              disabled={!mailConfigured}
              onClick={() => {
                if (!window.confirm(`Send this to ${activeSubscribers} active subscriber${activeSubscribers === 1 ? "" : "s"} now?`)) return;
                run(
                  () => saveThen(() => sendNow(issue.id)) as Promise<Awaited<ReturnType<typeof sendNow>>>,
                  (r) => {
                    router.refresh();
                    return `Sent to ${r.sent}${r.skipped ? `, ${r.skipped} already had it` : ""}${r.failed ? `, ${r.failed} failed` : ""}.`;
                  },
                );
              }}
            >
              Send now
            </button>
            <label className="flex flex-col gap-1 text-sm">
              Schedule for
              <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="rounded border px-2 py-1" />
            </label>
            <button
              type="button"
              className={button}
              disabled={!scheduleAt}
              onClick={() =>
                run(
                  () => saveThen(() => scheduleIssue(issue.id, new Date(scheduleAt).toISOString())) as Promise<{ ok: true } | Fail>,
                  () => {
                    router.refresh();
                    return "Scheduled.";
                  },
                )
              }
            >
              Schedule
            </button>
            {issue.status === "scheduled" ? (
              <button type="button" className={button} onClick={() => run(() => unscheduleIssue(issue.id), () => { router.refresh(); return "Back to draft."; })}>
                Unschedule
              </button>
            ) : null}
          </div>
        </section>
      </fieldset>

      {pending ? <p role="status" className="text-sm">Working…</p> : null}
      {note ? (
        <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-sm text-green-700" : "text-sm text-red-600"}>
          {note.text}
        </p>
      ) : null}

      {preview ? (
        <section aria-label="Preview" className="flex flex-col gap-2">
          <h2 className="font-semibold">Preview</h2>
          {/* The rendered email in a sandbox with no permissions: no scripts, no navigation. */}
          <iframe title="Newsletter preview" sandbox="" srcDoc={preview} className="h-[36rem] w-full rounded border bg-white" />
        </section>
      ) : null}
    </div>
  );
}
