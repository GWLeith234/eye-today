import { EVENT_TYPE_LABELS, EVENT_TYPES } from "@/lib/events/types";

export type EventFieldValues = {
  title: string;
  event_type: string;
  attendance: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  tz: string;
  venue: string;
  country: string;
  city: string;
  organiser_name: string;
  price_note: string;
  registration_url: string;
  listing_slug: string;
};

export const EMPTY_EVENT_FIELDS: EventFieldValues = {
  title: "",
  event_type: "",
  attendance: "in_person",
  start_date: "",
  start_time: "",
  end_date: "",
  end_time: "",
  tz: "",
  venue: "",
  country: "",
  city: "",
  organiser_name: "",
  price_note: "",
  registration_url: "",
  listing_slug: "",
};

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

// The fields an organiser and an editor share. Server component: plain inputs, no client state.
export function EventFields({ values, zones }: { values: EventFieldValues; zones: string[] }) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        Event name
        <input name="title" required maxLength={160} defaultValue={values.title} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Type
        <select name="event_type" required defaultValue={values.event_type} className={field}>
          <option value="" disabled>Choose a type</option>
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>{EVENT_TYPE_LABELS[type]}</option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1">Where</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="attendance" value="in_person" defaultChecked={values.attendance !== "online"} /> In person
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="attendance" value="online" defaultChecked={values.attendance === "online"} /> Online
        </label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Start date
          <input name="start_date" type="date" required defaultValue={values.start_date} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Start time
          <input name="start_time" type="time" required defaultValue={values.start_time} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          End date
          <input name="end_date" type="date" defaultValue={values.end_date} className={field} />
          <span className="text-xs text-muted">Leave blank if it ends the same day.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          End time
          <input name="end_time" type="time" required defaultValue={values.end_time} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Time zone the times are in
        <input name="tz" required list="event-time-zones" maxLength={64} placeholder="America/Cancun" defaultValue={values.tz} className={field} />
        <datalist id="event-time-zones">
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <span className="text-xs text-muted">The city-based zone name, for example America/Vancouver or Africa/Johannesburg.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Venue
        <input name="venue" maxLength={200} defaultValue={values.venue} className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          City
          <input name="city" maxLength={80} defaultValue={values.city} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Country code
          <input name="country" maxLength={2} placeholder="MX" autoCapitalize="characters" defaultValue={values.country} className={`${field} uppercase`} />
          <span className="text-xs text-muted">Required for in-person events.</span>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Organiser
        <input name="organiser_name" required maxLength={160} defaultValue={values.organiser_name} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Price
        <input name="price_note" maxLength={200} placeholder="Free, by donation, from $200…" defaultValue={values.price_note} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Registration link
        <input name="registration_url" type="url" maxLength={500} placeholder="https://" defaultValue={values.registration_url} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Directory listing (optional)
        <input name="listing_slug" maxLength={120} placeholder="Listing address or slug" defaultValue={values.listing_slug} className={field} />
        <span className="text-xs text-muted">Paste the Eye Today directory page of the host, if it has one.</span>
      </label>
    </>
  );
}
