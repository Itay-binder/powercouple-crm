/** DD/MM/YYYY HH:mm in Asia/Jerusalem (24h). For any ISO or parsable date string. */
export function formatIsraelDateTime(raw: string | Date | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const d = typeof raw === "string" ? new Date(raw) : raw;
  if (Number.isNaN(d.getTime())) {
    return typeof raw === "string" ? raw : "—";
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}
