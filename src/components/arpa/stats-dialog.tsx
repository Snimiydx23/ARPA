"use client";
// ARPA V3.9 — Usage stats dashboard with reaction analytics.
// Shows a 7-day message bar chart + totals + reaction breakdown. Uses /api/stats.
import * as React from "react";
import { BarChart3, MessageSquare, Bookmark, Hash, Loader2, TrendingUp, ThumbsUp, ThumbsDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, fmtDate, type SubStatus } from "@/lib/arpa-client";

type Day = { day: string; count: number };
type Stats = {
  ok: boolean;
  week?: Day[];
  totals?: { chats: number; pinned: number; messages: number; weekMessages: number; upReactions: number; downReactions: number };
  error?: string;
};

export function StatsDialog({
  open,
  onOpenChange,
  sub,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sub: SubStatus;
}) {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setStats(null);
    api<Stats>("/api/stats").then(({ data }) => {
      setStats(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open]);

  const week = stats?.week || [];
  const maxCount = Math.max(1, ...week.map((d) => d.count));
  const totals = stats?.totals;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-arpa" /> Your usage
          </DialogTitle>
          <DialogDescription>Your ARPA usage over the last 7 days.</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}

        {!loading && stats && !stats.ok && (
          <p className="py-6 text-center text-sm text-muted-foreground">{stats.error || "Stats could not be loaded"}</p>
        )}

        {!loading && stats?.ok && (
          <>
            {/* summary cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard icon={MessageSquare} label="Total chats" value={totals?.chats ?? 0} accent="text-arpa" />
              <StatCard icon={Hash} label="Total messages" value={totals?.messages ?? 0} accent="text-emerald-500" />
              <StatCard icon={Bookmark} label="Pinned chats" value={totals?.pinned ?? 0} accent="text-amber-500" />
              <StatCard icon={TrendingUp} label="This week" value={totals?.weekMessages ?? 0} accent="text-rose-500" />
            </div>

            {/* V3.9: reaction analytics */}
            {(totals?.upReactions || totals?.downReactions) ? (
              <div className="mt-3 rounded-xl border border-border p-3.5">
                <p className="mb-2 text-sm font-medium">Reaction feedback</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="grid size-8 place-items-center rounded-lg bg-green-500/10">
                      <ThumbsUp className="size-4 text-green-500" />
                    </div>
                    <div>
                      <p className="text-lg font-bold leading-none">{totals?.upReactions ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Good responses</p>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="flex items-center gap-1.5">
                    <div className="grid size-8 place-items-center rounded-lg bg-rose-500/10">
                      <ThumbsDown className="size-4 text-rose-500" />
                    </div>
                    <div>
                      <p className="text-lg font-bold leading-none">{totals?.downReactions ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Bad responses</p>
                    </div>
                  </div>
                  {totals && totals.upReactions + totals.downReactions > 0 && (
                    <div className="ml-auto text-right">
                      <p className="text-lg font-bold leading-none text-arpa">
                        {Math.round((totals.upReactions / (totals.upReactions + totals.downReactions)) * 100)}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">Positive</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* 7-day bar chart */}
            <div className="mt-4 rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-medium">Last 7 days</p>
              <div className="flex h-32 items-end justify-between gap-2">
                {week.map((d, i) => {
                  const h = Math.max(4, (d.count / maxCount) * 100);
                  const isToday = i === week.length - 1;
                  const label = new Date(d.day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });
                  return (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                      <div className="relative flex w-full flex-1 items-end">
                        <div
                          className={`w-full rounded-t-md transition-all ${isToday ? "bg-arpa" : "bg-arpa/40"}`}
                          style={{ height: `${h}%` }}
                          title={`${d.count} messages`}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                      <span className={`text-[10px] font-medium ${d.count > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>{d.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* plan status */}
            <div className="mt-4 rounded-xl bg-muted/50 p-3.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current plan</span>
                <span className="font-medium capitalize">{sub.state === "paid" ? "Pro" : sub.state}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Daily limit</span>
                <span className="font-medium">{sub.limit} messages</span>
              </div>
              {sub.state !== "expired" && (
                <div className="mt-1.5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{sub.state === "paid" ? "Renews" : "Trial ends"}</span>
                  <span className="font-medium">{fmtDate(sub.until)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <Icon className={`size-4 ${accent}`} />
      <p className="mt-1.5 text-2xl font-bold">{value.toLocaleString("en-IN")}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
