export const EVENT_FORM_ERRORS: Record<string, string> = {
  invalid: "Check the name, type, organiser, dates and time zone. In-person events need a country code, and a registration link must start with https://.",
  listing: "That directory listing isn’t published. Leave it blank or paste a live listing’s address.",
  challenge: "We couldn’t verify you’re human. Please try the check again.",
  limited: "You’ve sent several events today. Please try again tomorrow.",
  unavailable: "Event submissions are closed right now. Please try again later.",
  not_found: "That event can’t be edited. Only your own pending or rejected events can be resubmitted.",
  failed: "Something went wrong sending the event. Please try again.",
};
