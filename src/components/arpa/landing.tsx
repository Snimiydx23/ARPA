"use client";
// ARPA V3.1 — Landing / login page (polished).
// Aurora animated background, gradient hero text, better feature cards.
import * as React from "react";
import { toast } from "sonner";
import { Sparkles, Zap, Cloud, Languages, Loader2, Mail, ArrowRight, Mic, Volume2, Download, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ls, tokenStore, type AppConfig, type ArpaUser, type SubStatus } from "@/lib/arpa-client";
import { useArpa } from "@/lib/store";

const FEATURES = [
  { icon: Zap, title: "Instant replies", desc: "Answers as fast as you can type" },
  { icon: Cloud, title: "History sync", desc: "Your chats on both phone and PC" },
  { icon: Languages, title: "English-ready", desc: "Conversations in your language" },
];

const HIGHLIGHTS = [
  { icon: Mic, label: "Voice input" },
  { icon: Volume2, label: "Read aloud" },
  { icon: Download, label: "Export chats" },
  { icon: Bookmark, label: "Pin chats" },
];

export function Landing({ config }: { config: AppConfig }) {
  const setSession = useArpa((s) => s.setSession);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const last = ls.get<string>("arpa_dev_email", "");
    if (last) setEmail(last);
  }, []);

  const trialText = config.trialDays >= 60
    ? `First ${Math.round(config.trialDays / 30)} months absolutely FREE`
    : `First ${config.trialDays} days absolutely FREE`;

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      toast.error("Please enter a valid email.");
      return;
    }
    setLoading(true);
    try {
      const { status, data } = await api<{ ok: boolean; token: string; user: ArpaUser; sub: SubStatus; error?: string }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email: em, name: name.trim() || undefined }) }
      );
      if (status !== 200 || !data?.ok) {
        toast.error(data?.error || "Login failed, please try again.");
        return;
      }
      tokenStore.set(data.token);
      ls.set("arpa_dev_email", em);
      setSession({ user: data.user, sub: data.sub, usedToday: 0 });
      toast.success(`Welcome, ${data.user.name}! 🎉`);
    } catch (err: any) {
      toast.error(err?.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (e: string) => {
    setEmail(e);
    setTimeout(() => (document.getElementById("arpa-login-btn") as HTMLButtonElement)?.click(), 0);
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* aurora animated background */}
      <div className="arpa-aurora" aria-hidden />

      {/* header */}
      <header className="relative z-10 arpa-glass flex items-center gap-2.5 px-5 py-4 sm:px-8 border-b border-border/40">
        <div className="grid size-8 place-items-center rounded-lg bg-arpa font-extrabold text-arpa-foreground">A</div>
        <span className="flex-1 text-lg font-semibold tracking-wide">ARPA</span>
        <Button variant="outline" size="sm" asChild>
          <a href="#login">Log in</a>
        </Button>
      </header>

      {/* hero */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full max-w-xl text-center">
          <div className="arpa-zoom mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-arpa text-3xl font-extrabold text-arpa-foreground shadow-xl shadow-arpa/30">A</div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            <span className="arpa-gradient-text">Your own</span>
            <br />
            AI Assistant
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground sm:text-lg">
            Hinglish, Hindi or English — ask anything. Finance, tax, emails, Excel, coding, studies… ARPA answers instantly.
          </p>

          <div className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-arpa-soft px-3.5 py-1.5 text-sm font-semibold text-arpa">
            <Sparkles className="size-4" /> {trialText}
          </div>

          {/* login card */}
          <form
            id="login"
            onSubmit={onLogin}
            className="arpa-glass mx-auto mt-7 max-w-sm rounded-2xl border border-border/60 p-5 text-left shadow-lg"
          >
            <Label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-9"
                autoComplete="email"
                required
              />
            </div>
            <Label htmlFor="name" className="mb-1.5 mt-3 block text-sm font-medium">Name <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
            <Button id="arpa-login-btn" type="submit" className="mt-4 w-full bg-arpa text-arpa-foreground hover:opacity-90" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {loading ? "Logging in…" : "Continue"}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Demo: any email will work. No password needed.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {["demo@arpa.ai", "test@gmail.com", "rahul@example.com"].map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => quickLogin(e)}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {e}
                </button>
              ))}
            </div>
          </form>

          {/* features */}
          <div className="mt-8 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="group rounded-xl border border-border/60 bg-card/60 p-3.5 transition-all hover:border-arpa/40 hover:shadow-md">
                <div className="grid size-8 place-items-center rounded-lg bg-arpa-soft text-arpa transition-transform group-hover:scale-110">
                  <f.icon className="size-4" />
                </div>
                <p className="mt-1.5 text-sm font-semibold">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* highlight chips */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {HIGHLIGHTS.map((h) => (
              <span key={h.label} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground">
                <h.icon className="size-3.5 text-arpa" /> {h.label}
              </span>
            ))}
          </div>
        </div>
      </main>

      {/* footer */}
      <footer className="relative z-10 px-4 py-4 text-center text-xs text-muted-foreground">
        <span>ARPA can make mistakes. Please verify important information.</span>
      </footer>
    </div>
  );
}
