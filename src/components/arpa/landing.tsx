"use client";
// ARPA V3.6 — Landing / sign-in page (professional layout + Google Sign-In).
// Google Identity Services button when GOOGLE_CLIENT_ID is set; email login kept as fallback.
import * as React from "react";
import { toast } from "sonner";
import {
  Sparkles, Zap, Cloud, Languages, Loader2, Mail, ArrowRight, Mic, Volume2, Download, Bookmark,
  ShieldCheck, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ls, tokenStore, type AppConfig, type ArpaUser, type SubStatus } from "@/lib/arpa-client";
import { useArpa } from "@/lib/store";

const FEATURES = [
  { icon: Zap, title: "Instant replies", desc: "Answers as fast as you can type" },
  { icon: Cloud, title: "History sync", desc: "Your chats on both phone and PC" },
  { icon: Languages, title: "Multilingual", desc: "English, Hindi or Hinglish — your choice" },
];

const HIGHLIGHTS = [
  { icon: Mic, label: "Voice input" },
  { icon: Volume2, label: "Read aloud" },
  { icon: Download, label: "Export chats" },
  { icon: Bookmark, label: "Pin chats" },
];

const USE_CASES = ["Finance & tax", "Emails & drafting", "Excel & data", "Coding", "Studies"];

type LoginResp = { ok: boolean; token: string; user: ArpaUser; sub: SubStatus; error?: string };

declare global {
  interface Window { google?: any }
}

/* ---------- Google Identity Services loader (loaded once) ---------- */
let gsiPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { gsiPromise = null; reject(new Error("Could not load Google Sign-In")); };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

function GoogleButton({ clientId, onCredential, disabled }: {
  clientId: string; onCredential: (cred: string) => void; disabled?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const cbRef = React.useRef(onCredential);
  cbRef.current = onCredential;
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    loadGsi().then(() => {
      if (cancelled || !ref.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r: { credential?: string }) => r.credential && cbRef.current(r.credential),
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      const width = Math.min(360, Math.max(240, ref.current.offsetWidth || 320));
      window.google.accounts.id.renderButton(ref.current, {
        type: "standard", theme: "outline", size: "large", text: "continue_with",
        shape: "rectangular", logo_alignment: "center", width,
      });
      setReady(true);
    }).catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, [clientId]);

  if (failed) {
    return <p className="text-center text-sm text-destructive">Google Sign-In could not load. Please check your connection and refresh.</p>;
  }
  return (
    <div className={`relative ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      {!ready && <div className="h-10 w-full animate-pulse rounded-md border border-border bg-muted/60" />}
      <div ref={ref} className="flex w-full justify-center" />
    </div>
  );
}

export function Landing({ config }: { config: AppConfig }) {
  const setSession = useArpa((s) => s.setSession);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [showEmail, setShowEmail] = React.useState(false);

  const googleEnabled = !!config.googleClientId;
  const emailEnabled = config.emailLogin ?? !googleEnabled;
  const year = new Date().getFullYear();

  React.useEffect(() => {
    const last = ls.get<string>("arpa_dev_email", "");
    if (last) setEmail(last);
  }, []);

  const trialText = config.trialDays >= 60
    ? `First ${Math.round(config.trialDays / 30)} months free`
    : `First ${config.trialDays} days free`;

  const finishLogin = (data: LoginResp, em?: string) => {
    tokenStore.set(data.token);
    if (em) ls.set("arpa_dev_email", em);
    setSession({ user: data.user, sub: data.sub, usedToday: 0 });
    toast.success(`Welcome, ${data.user.name}!`);
  };

  const onGoogle = async (credential: string) => {
    setLoading(true);
    try {
      const { status, data } = await api<LoginResp>("/api/auth/google", {
        method: "POST", body: JSON.stringify({ credential }),
      });
      if (status !== 200 || !data?.ok) { toast.error(data?.error || "Google sign-in failed."); return; }
      finishLogin(data);
    } catch (err: any) {
      toast.error(err?.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      toast.error("Please enter a valid email.");
      return;
    }
    setLoading(true);
    try {
      const { status, data } = await api<LoginResp>("/api/auth/login", {
        method: "POST", body: JSON.stringify({ email: em, name: name.trim() || undefined }),
      });
      if (status !== 200 || !data?.ok) { toast.error(data?.error || "Login failed, please try again."); return; }
      finishLogin(data, em);
    } catch (err: any) {
      toast.error(err?.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const emailForm = (
    <form onSubmit={onLogin} className="space-y-3 text-left">
      <div>
        <Label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com" className="h-10 pl-9" autoComplete="email" required />
        </div>
      </div>
      <div>
        <Label htmlFor="name" className="mb-1.5 block text-sm font-medium">
          Full name <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Your name" className="h-10" autoComplete="name" />
      </div>
      <Button id="arpa-login-btn" type="submit" disabled={loading}
        className="h-10 w-full bg-arpa text-arpa-foreground hover:opacity-90">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        {loading ? "Signing in…" : "Continue with email"}
      </Button>
    </form>
  );

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* subtle background: soft brand glow + fine grid */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-[0.12] blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--arpa), transparent)" }} />
        <div className="absolute inset-0 opacity-[0.35] dark:opacity-[0.15]"
          style={{
            backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at top, black 20%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse at top, black 20%, transparent 70%)",
          }} />
      </div>

      {/* header */}
      <header className="relative z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2.5 px-4 sm:px-6">
          <div className="grid size-8 place-items-center rounded-lg bg-arpa text-sm font-bold text-arpa-foreground">A</div>
          <span className="flex-1 text-base font-semibold tracking-tight">{config.app || "ARPA"}</span>
          <Button variant="outline" size="sm" asChild>
            <a href="#signin">Sign in</a>
          </Button>
        </div>
      </header>

      {/* main */}
      <main className="relative z-10 flex flex-1 items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-16">
          {/* left — pitch */}
          <section className="text-center lg:text-left">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-arpa/20 bg-arpa-soft px-3 py-1 text-xs font-medium text-arpa">
              <Sparkles className="size-3.5" /> {trialText}
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Your own <span className="arpa-gradient-text">AI assistant</span>
              <br className="hidden sm:block" /> for everyday work
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0">
              Ask anything in English, Hindi or Hinglish. Finance, tax, emails, Excel, coding, studies —
              {" "}{config.app || "ARPA"} answers instantly.
            </p>

            <ul className="mx-auto mt-6 flex max-w-lg flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground lg:mx-0 lg:justify-start">
              {USE_CASES.map((u) => (
                <li key={u} className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-arpa" /> {u}
                </li>
              ))}
            </ul>

            <div className="mt-8 hidden gap-3 text-left sm:grid sm:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm">
                  <div className="grid size-8 place-items-center rounded-lg bg-arpa-soft text-arpa">
                    <f.icon className="size-4" />
                  </div>
                  <p className="mt-2.5 text-sm font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* right — sign-in card */}
          <section id="signin" className="mx-auto w-full max-w-md scroll-mt-24">
            <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-xl shadow-black/[0.04] sm:p-8">
              <div className="text-center">
                <div className="mx-auto grid size-11 place-items-center rounded-xl bg-arpa text-lg font-bold text-arpa-foreground">A</div>
                <h2 className="mt-4 text-xl font-semibold tracking-tight">Sign in to {config.app || "ARPA"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Start your free trial — no card required.</p>
              </div>

              <div className="mt-6 space-y-4">
                {googleEnabled && (
                  <GoogleButton clientId={config.googleClientId!} onCredential={onGoogle} disabled={loading} />
                )}

                {googleEnabled && loading && (
                  <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Signing you in…
                  </p>
                )}

                {googleEnabled && emailEnabled && (
                  <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
                    <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
                  </div>
                )}

                {emailEnabled && (googleEnabled && !showEmail ? (
                  <Button variant="outline" className="h-10 w-full" onClick={() => setShowEmail(true)}>
                    <Mail className="size-4" /> Continue with email
                  </Button>
                ) : emailForm)}
              </div>

              <div className="mt-6 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-arpa" />
                <span>We only use your name and email to create your account. Your chats stay private to you.</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {HIGHLIGHTS.map((h) => (
                <span key={h.label} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
                  <h.icon className="size-3.5 text-arpa" /> {h.label}
                </span>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* footer */}
      <footer className="relative z-10 border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>© {year} {config.app || "ARPA"}. {config.app || "ARPA"} can make mistakes — please verify important information.</span>
          {config.support && (
            <a href={`mailto:${config.support}`} className="hover:text-foreground">{config.support}</a>
          )}
        </div>
      </footer>
    </div>
  );
}
