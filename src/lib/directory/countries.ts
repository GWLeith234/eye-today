export function countryName(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return upper;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(upper);
    return name && name.toUpperCase() !== upper ? name : upper;
  } catch {
    return upper;
  }
}

export function isCountryCode(value: string): boolean {
  return /^[a-z]{2}$/i.test(value);
}
