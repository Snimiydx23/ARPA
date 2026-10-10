"use client";
// ARPA V3.8 — Date separator chip shown between message groups.
// Renders a small pill like "Today", "Yesterday", "Oct 7" centered in the thread.
function fmtSep(t: number) {
  const now = new Date();
  const day = 86400000;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= start) return "Today";
  if (t >= start - day) return "Yesterday";
  const d = new Date(t);
  if (t >= start - 7 * day) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function DateSeparator({ t }: { t: number }) {
  return (
    <div className="my-4 flex items-center justify-center">
      <span className="rounded-full border border-border bg-muted/50 px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
        {fmtSep(t)}
      </span>
    </div>
  );
}
