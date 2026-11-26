/**
 * Full name for the greeting with each word capitalised.
 * All-lower or all-upper names are title-cased ("lalit dev" / "LALIT DEV" → "Lalit Dev"),
 * including after a hyphen or apostrophe ("sean o'brien" → "Sean O'Brien");
 * mixed-case names keep their casing apart from the first letter ("McDonald" stays).
 */
export function formatFullName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return "";
  const uniformCase = name === name.toLowerCase() || name === name.toUpperCase();
  if (uniformCase) {
    // Title-case, also after a hyphen or apostrophe: "jean-luc d'arcy" → "Jean-Luc D'Arcy".
    return name
      .toLowerCase()
      .replace(/(^|[ \-'\u2019])(\S)/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
