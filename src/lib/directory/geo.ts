// Coordinates for the directory map. Both or neither; latitude -90..90, longitude -180..180.
// No server-only import: the tests load this file.

export type Coordinates = { ok: true; lat: number | null; lng: number | null } | { ok: false; error: string };

export function parseCoordinates(latText: string, lngText: string): Coordinates {
  const a = latText.trim();
  const b = lngText.trim();
  if (a === "" && b === "") return { ok: true, lat: null, lng: null };
  if (a === "" || b === "") return { ok: false, error: "Give both a latitude and a longitude, or leave both empty." };
  const number = /^-?\d{1,3}(?:\.\d+)?$/;
  if (!number.test(a) || !number.test(b)) return { ok: false, error: "Latitude and longitude are plain numbers, like 20.2114 and -87.4654." };
  const lat = Number(a);
  const lng = Number(b);
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
    return { ok: false, error: "Latitude is between -90 and 90, and longitude between -180 and 180." };
  }
  return { ok: true, lat, lng };
}
