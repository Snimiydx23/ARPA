"use client";
// ARPA — Admin dashboard (/admin). Visible only to admins (User.role "admin" or ADMIN_EMAILS).
// KPIs, daily charts (one measure per chart — no dual axes), model breakdown, user management, errors, audit log.
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  ArrowLeft, RefreshCw, Users, Activity, MessageSquare, IndianRupee, Cpu, AlertTriangle, Wallet, ShieldCheck,
  Search, MoreHorizontal, Ban, CheckCircle2, CalendarPlus, Loader2, ShieldOff, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/arpa-client";

type Daily = { day: string; messages: number; activeUsers: number; signups: number; costUsd: number; tokens: number; errors: number; aiCalls: number };
type Stats = {
  days: number; range: { from: string; to: string }; usdInr: number;
  totals: { users: number; newUsers: number; blockedUsers: number; activeUsers: number; messages: number; aiCalls: number; costUsd: number; tokens: number; errors: number; revenuePaise: number; payments: number; plans: { paid: number; trial: number; expired: number } };
  daily: Daily[]; models: { model: string; calls: number; costUsd: number; tokens: number; avgLatencyMs: number }[]; kinds: { kind: string; calls: number }[];
};
type AdminUser = {
  id: string; email: string; name: string; picture: string; plan: string; admin: boolean; role: string; blocked: boolean; blockedReason: string;
  createdAt: number; lastSeen: number; sub: { state: "paid" | "trial" | "expired"; until: number; daysLeft: number }; messages30d: number; costUsd30d: number;
};
type Filter = "all" | "paid" | "trial" | "expired" | "blocked" | "admin";

const inr = (n: number, d = 0) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const compact = (n: number) => n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(2)} L` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n));
const dShort = (day: string) => new Date(`${day}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const ago = (ms: number) => {
  const s = (Date.now() - ms) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

function Tile({ icon: Icon, label, value, sub, warn, small }: { icon: typeof Users; label: string; value: string; sub?: string; warn?: boolean; small?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className={`size-3.5 ${warn ? "text-amber-600" : "text-arpa"}`} /> {label}</p>
      <p className={`mt-1.5 truncate font-semibold tabular-nums tracking-tight ${small ? "py-1 text-base" : "text-2xl"}`} title={value}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, total, children }: { title: string; total: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
      </div>
      <div className="h-44">{children}</div>
    </div>
  );
}

function ChartTip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="text-muted-foreground">{dShort(label)}</p>
      <p className="font-semibold tabular-nums text-foreground">{fmt(payload[0].value)}</p>
    </div>
  );
}

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;

export default function AdminPage() {
  const [days, setDays] = React.useState<7 | 30 | 90>(30);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [denied, setDenied] = React.useState<"" | "login" | "forbidden">("");
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [page, setPage] = React.useState(1);
  const [users, setUsers] = React.useState<{ total: number; pageSize: number; users: AdminUser[] } | null>(null);
  const [errors, setErrors] = React.useState<any[] | null>(null);
  const [audit, setAudit] = React.useState<any[] | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const loadStats = React.useCallback(async () => {
    setLoading(true);
    try {
      const { status, data } = await api<Stats & { ok: boolean }>(`/api/admin/stats?days=${days}`);
      if (status === 401) return setDenied("login");
      if (status === 403) return setDenied("forbidden");
      if (status === 200 && data?.ok) setStats(data);
      else toast.error("Could not load stats");
    } finally { setLoading(false); }
  }, [days]);

  const loadUsers = React.useCallback(async () => {
    const p = new URLSearchParams({ q, filter, page: String(page) });
    const { status, data } = await api<any>(`/api/admin/users?${p}`);
    if (status === 200 && data?.ok) setUsers(data);
  }, [q, filter, page]);

  React.useEffect(() => { loadStats(); }, [loadStats]);
  React.useEffect(() => { const t = setTimeout(loadUsers, 250); return () => clearTimeout(t); }, [loadUsers]);

  const loadTab = async (tab: string) => {
    if (tab === "errors" && !errors) { const { data } = await api<any>("/api/admin/errors"); setErrors(data?.errors || []); }
    if (tab === "audit") { const { data } = await api<any>("/api/admin/audit"); setAudit(data?.audit || []); }
  };

  const act = async (u: AdminUser, body: Record<string, unknown>, okMsg: string) => {
    setBusyId(u.id);
    try {
      const { status, data } = await api<any>(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (status !== 200 || !data?.ok) { toast.error(data?.error || "Action failed"); return; }
      toast.success(okMsg);
      setAudit(null);
      await Promise.all([loadUsers(), loadStats()]);
    } finally { setBusyId(null); }
  };
  const extend = (u: AdminUser, d?: number) => {
    let n = d;
    if (n === undefined) {
      const v = prompt(`Extend ${u.sub.state === "paid" ? "plan" : "trial"} for ${u.email} by how many days? (negative to reduce)`, "15");
      if (v === null) return;
      n = Math.round(Number(v));
      if (!Number.isFinite(n) || n === 0) { toast.error("Enter a whole number of days"); return; }
    }
    act(u, { action: "extend", days: n }, `${u.sub.state === "paid" ? "Plan" : "Trial"} ${n > 0 ? "extended" : "reduced"} by ${Math.abs(n)} days`);
  };
  const block = (u: AdminUser) => {
    const reason = prompt(`Block ${u.email}? They will be signed out of all features.\nReason (optional):`, "");
    if (reason === null) return;
    act(u, { action: "block", reason }, "User blocked");
  };

  if (denied) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-6 text-center">
        <div>
          <ShieldOff className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">{denied === "login" ? "Please sign in first" : "Admins only"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {denied === "login" ? "Sign in to ARPA, then open this page again." : "Your account doesn't have admin access. Ask the owner to add your email to ADMIN_EMAILS."}
          </p>
          <Button asChild className="mt-4 bg-arpa text-arpa-foreground hover:opacity-90"><Link href="/">Back to ARPA</Link></Button>
        </div>
      </div>
    );
  }

  const t = stats?.totals;
  const rate = stats?.usdInr || 88;
  const errRate = t && t.aiCalls ? (t.errors / t.aiCalls) * 100 : 0;
  const daily = stats?.daily || [];
  const tickEvery = days === 7 ? 0 : days === 30 ? 4 : 13;
  const maxCalls = Math.max(1, ...(stats?.models || []).map((m) => m.calls));
  const pages = users ? Math.max(1, Math.ceil(users.total / users.pageSize)) : 1;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back to chat"><Link href="/"><ArrowLeft className="size-4" /></Link></Button>
          <div className="grid size-8 place-items-center rounded-lg bg-arpa text-sm font-extrabold text-arpa-foreground">A</div>
          <div className="mr-auto">
            <h1 className="flex items-center gap-1.5 text-base font-semibold"><ShieldCheck className="size-4 text-arpa" /> Admin dashboard</h1>
            {stats && <p className="text-xs text-muted-foreground">{dShort(stats.range.from)} – {dShort(stats.range.to)} · IST</p>}
          </div>
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Period">
            {([7, 30, 90] as const).map((d) => (
              <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}
                className={`rounded-md px-3 py-1 text-sm ${days === d ? "bg-arpa text-arpa-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {d}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => { loadStats(); loadUsers(); }} aria-label="Refresh">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {!stats ? (
          <div className="grid h-60 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Key numbers">
              <Tile icon={Users} label="Users" value={compact(t!.users)} sub={`+${t!.newUsers} new in ${days}d${t!.blockedUsers ? ` · ${t!.blockedUsers} blocked` : ""}`} />
              <Tile icon={Activity} label="Active users" value={compact(t!.activeUsers)} sub={`sent ≥1 message in ${days}d`} />
              <Tile icon={MessageSquare} label="Messages" value={compact(t!.messages)} sub={`${compact(t!.aiCalls)} AI calls`} />
              <Tile icon={IndianRupee} label="AI cost" value={inr(t!.costUsd * rate, 2)} sub={`$${t!.costUsd.toFixed(2)} · ${compact(t!.tokens)} tokens`} />
              <Tile icon={Wallet} label="Revenue" value={inr(t!.revenuePaise / 100)} sub={`${t!.payments} payment${t!.payments === 1 ? "" : "s"}`} />
              <Tile icon={Cpu} label="Plans" value={`${t!.plans.paid} paid`} sub={`${t!.plans.trial} on trial · ${t!.plans.expired} expired`} />
              <Tile icon={AlertTriangle} label="Error rate" value={`${errRate.toFixed(1)}%`} sub={`${t!.errors} failed AI calls`} warn={errRate > 5} />
              <Tile icon={Cpu} label="Top model" small value={stats.models[0]?.model.split("/").pop() || "—"} sub={stats.models[0] ? `${compact(stats.models[0].calls)} calls` : "no calls yet"} />
            </section>

            <section className="grid gap-3 lg:grid-cols-3" aria-label="Daily trends">
              <ChartCard title="Messages per day" total={`${compact(t!.messages)} total`}>
                <ResponsiveContainer>
                  <BarChart data={daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" tickFormatter={dShort} interval={tickEvery} {...axis} />
                    <YAxis allowDecimals={false} width={40} tickFormatter={compact} {...axis} />
                    <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTip fmt={(v: number) => `${v.toLocaleString("en-IN")} messages`} />} />
                    <Bar dataKey="messages" fill="var(--viz-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Active users per day" total={`${compact(t!.activeUsers)} unique`}>
                <ResponsiveContainer>
                  <LineChart data={daily} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" tickFormatter={dShort} interval={tickEvery} {...axis} />
                    <YAxis allowDecimals={false} width={40} tickFormatter={compact} {...axis} />
                    <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<ChartTip fmt={(v: number) => `${v} active users`} />} />
                    <Line type="linear" dataKey="activeUsers" stroke="var(--viz-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="AI cost per day" total={inr(t!.costUsd * rate, 2)}>
                <ResponsiveContainer>
                  <BarChart data={daily.map((d) => ({ ...d, costInr: d.costUsd * rate }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" tickFormatter={dShort} interval={tickEvery} {...axis} />
                    <YAxis width={44} tickFormatter={(v) => `₹${compact(v)}`} {...axis} />
                    <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTip fmt={(v: number) => inr(v, 2)} />} />
                    <Bar dataKey="costInr" fill="var(--viz-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>
          </>
        )}

        <Tabs defaultValue="users" onValueChange={loadTab}>
          <TabsList>
            <TabsTrigger value="users">Users{users ? ` (${users.total})` : ""}</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name or email" className="pl-8" />
              </div>
              <select aria-label="Filter users" value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setPage(1); }}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                {(["all", "paid", "trial", "expired", "blocked", "admin"] as Filter[]).map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">User</th>
                    <th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 text-right font-medium">Msgs (30d)</th>
                    <th className="px-3 py-2 text-right font-medium">AI cost (30d)</th>
                    <th className="px-3 py-2 font-medium">Joined</th>
                    <th className="px-3 py-2 font-medium">Last seen</th>
                    <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!users ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
                  ) : users.users.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No users match.</td></tr>
                  ) : users.users.map((u) => (
                    <tr key={u.id} className={u.blocked ? "bg-destructive/5" : ""}>
                      <td className="px-3 py-2">
                        <p className="flex items-center gap-1.5 font-medium">{u.name}{u.admin && <ShieldCheck className="size-3.5 text-arpa" aria-label="Admin" />}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="px-3 py-2">
                        {u.blocked ? (
                          <Badge variant="destructive" title={u.blockedReason || undefined}><Ban className="mr-1 size-3" /> Blocked</Badge>
                        ) : (
                          <Badge variant={u.sub.state === "paid" ? "default" : "secondary"} className={u.sub.state === "paid" ? "bg-arpa text-arpa-foreground" : ""}>
                            {u.sub.state === "paid" ? `Paid · ${u.plan}` : u.sub.state === "trial" ? "Trial" : "Expired"}
                          </Badge>
                        )}
                        {!u.blocked && u.sub.state !== "expired" && <p className="mt-0.5 text-[11px] text-muted-foreground">{u.sub.daysLeft}d left</p>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{u.messages30d.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{inr(u.costUsd30d * rate, 2)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{ago(u.lastSeen)}</td>
                      <td className="px-3 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" disabled={busyId === u.id} aria-label={`Actions for ${u.email}`}>
                              {busyId === u.id ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[200px]">
                            <DropdownMenuItem onSelect={() => extend(u, 7)}><CalendarPlus className="mr-2 size-4" /> Extend {u.sub.state === "paid" ? "plan" : "trial"} +7 days</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => extend(u, 30)}><CalendarPlus className="mr-2 size-4" /> Extend +30 days</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => extend(u)}><CalendarPlus className="mr-2 size-4" /> Custom days…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {u.blocked
                              ? <DropdownMenuItem onSelect={() => act(u, { action: "unblock" }, "User unblocked")}><CheckCircle2 className="mr-2 size-4 text-green-600" /> Unblock</DropdownMenuItem>
                              : <DropdownMenuItem onSelect={() => block(u)} className="text-destructive"><Ban className="mr-2 size-4" /> Block user…</DropdownMenuItem>}
                            {u.role === "admin"
                              ? <DropdownMenuItem onSelect={() => act(u, { action: "role", role: "user" }, "Admin role removed")}><ShieldOff className="mr-2 size-4" /> Remove admin</DropdownMenuItem>
                              : !u.admin && <DropdownMenuItem onSelect={() => confirm(`Make ${u.email} an admin?`) && act(u, { action: "role", role: "admin" }, "Admin role granted")}><ShieldCheck className="mr-2 size-4" /> Make admin</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users && pages > 1 && (
              <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                Page {page} of {pages}
                <Button variant="outline" size="icon" className="size-8" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="models" className="mt-3">
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2 font-medium">Model ({days}d)</th><th className="w-1/3 px-3 py-2 font-medium">Calls</th><th className="px-3 py-2 text-right font-medium">Tokens</th><th className="px-3 py-2 text-right font-medium">Cost</th><th className="px-3 py-2 text-right font-medium">Avg latency</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(stats?.models || []).length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No AI calls in this period.</td></tr>
                  ) : stats!.models.map((m) => (
                    <tr key={m.model}>
                      <td className="px-3 py-2 font-mono text-xs">{m.model}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${(m.calls / maxCalls) * 100}%`, background: "var(--viz-1)" }} /></div>
                          <span className="w-12 text-right tabular-nums">{compact(m.calls)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{compact(m.tokens)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{inr(m.costUsd * rate, 2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{(m.avgLatencyMs / 1000).toFixed(1)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!!stats?.kinds.length && (
              <p className="mt-2 text-xs text-muted-foreground">By type: {stats.kinds.map((k) => `${k.kind} ${compact(k.calls)}`).join(" · ")}</p>
            )}
          </TabsContent>

          <TabsContent value="errors" className="mt-3">
            <div className="divide-y divide-border rounded-xl border border-border">
              {!errors ? <p className="p-6 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></p>
                : errors.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No failed calls. 🎉</p>
                : errors.map((e) => (
                  <div key={e.id} className="px-3 py-2.5 text-sm">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="size-3.5 text-amber-600" /> <span>{new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                      <Badge variant="outline">{e.kind}</Badge> <span className="font-mono">{e.model || "—"}</span> <span>{e.email}</span>
                    </p>
                    <p className="mt-1 break-words">{e.error || "(no message)"}</p>
                  </div>
                ))}
            </div>
          </TabsContent>

          <TabsContent value="audit" className="mt-3">
            <div className="divide-y divide-border rounded-xl border border-border">
              {!audit ? <p className="p-6 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></p>
                : audit.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No admin actions yet.</p>
                : audit.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                    <span className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                    <span className="font-medium">{a.admin}</span>
                    <Badge variant="secondary">{a.action}</Badge>
                    <span>{a.target}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.action === "extend" ? `${a.details.days > 0 ? "+" : ""}${a.details.days} days (${a.details.field === "paidUntil" ? "plan" : "trial"})` : a.details.reason ? `“${a.details.reason}”` : a.details.to ? `→ ${a.details.to}` : ""}
                    </span>
                  </div>
                ))}
            </div>
          </TabsContent>
          <TabsContent value="storage" className="mt-3">
            <StoragePanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/** Chat storage: old JSON format vs Message table, with batch migration and rollback. */
function StoragePanel() {
  const [st, setSt] = React.useState<{ json: number; table: number; messages: number; writeMode: string } | null>(null);
  const [run, setRun] = React.useState<null | { to: "table" | "json"; done: number; messages: number; failed: number }>(null);
  const load = React.useCallback(async () => {
    const { data } = await api<any>("/api/admin/storage");
    if (data?.ok) setSt(data);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const migrate = async (to: "table" | "json") => {
    if (to === "json" && !confirm("Move every chat back to the old JSON format? Use this only to roll back.")) return;
    const prog = { to, done: 0, messages: 0, failed: 0 };
    setRun({ ...prog });
    try {
      for (let i = 0; i < 400; i++) {
        const { status, data } = await api<any>("/api/admin/storage", { method: "POST", body: JSON.stringify({ to, batch: 25 }) });
        if (status !== 200 || !data?.ok) { toast.error(data?.error || "Migration step failed"); break; }
        prog.done += data.converted; prog.messages += data.movedMessages; prog.failed += data.failed.length;
        setRun({ ...prog });
        setSt({ json: data.json, table: data.table, messages: data.messages, writeMode: data.writeMode });
        if (!data.remaining || (!data.converted && data.failed.length)) break;
      }
      toast.success(`${prog.done} chats converted${prog.failed ? ` · ${prog.failed} failed` : ""}`);
    } finally { setRun(null); load(); }
  };

  const total = st ? st.json + st.table : 0;
  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">Chat storage</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          New releases keep each message as its own row (faster saves and loading for long chats). Chats move to the new
          format automatically the next time they are saved; you can also move all of them now. Rollback is one click.
        </p>
      </div>
      {!st ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : (
        <>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Message table</p><p className="text-xl font-semibold tabular-nums">{st.table.toLocaleString("en-IN")}</p></div>
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Old JSON format</p><p className="text-xl font-semibold tabular-nums">{st.json.toLocaleString("en-IN")}</p></div>
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Message rows</p><p className="text-xl font-semibold tabular-nums">{st.messages.toLocaleString("en-IN")}</p></div>
          </div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${total ? (st.table / total) * 100 : 100}%`, background: "var(--viz-1)" }} /></div>
          <p className="text-xs text-muted-foreground">New saves are written as: <b>{st.writeMode === "json" ? "old JSON (CHAT_STORAGE=json)" : "Message table"}</b></p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="bg-arpa text-arpa-foreground hover:opacity-90" disabled={!!run || st.json === 0} onClick={() => migrate("table")}>
              {run?.to === "table" ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null} Move all chats to Message table
            </Button>
            <Button size="sm" variant="outline" disabled={!!run || st.table === 0} onClick={() => migrate("json")}>
              {run?.to === "json" ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null} Roll back to JSON
            </Button>
          </div>
          {run && <p className="text-xs text-muted-foreground" aria-live="polite">Converted {run.done} chats ({run.messages.toLocaleString("en-IN")} messages){run.failed ? ` · ${run.failed} failed` : ""}…</p>}
        </>
      )}
    </div>
  );
}
