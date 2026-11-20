"use client";
// ARPA V3.6 — Landing / sign-in page (professional layout + Google Sign-In).
// Claude-style "Continue with Google" button (Google OAuth popup); email login kept as fallback.
import * as React from "react";
import { toast } from "sonner";
import {
  Sparkles, Zap, Cloud, Languages, Loader2, Mail, ArrowRight, Mic, Volume2, Download, Bookmark,
  ShieldCheck, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ls, tokenStore, fmtTokens, tokenPeriodLabel, type AppConfig, type ArpaUser, type SubStatus } from "@/lib/arpa-client";
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

function GoogleLogo({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/* Claude-style "Continue with Google" button — one click opens the Google account chooser (popup). */
type FirebaseCfg = NonNullable<AppConfig["firebase"]>;

/* Firebase Authentication — Google popup → Firebase ID token (SDK loaded only on click) */
async function firebaseGoogleIdToken(cfg: FirebaseCfg): Promise<string> {
  const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut }] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
  ]);
  const app = getApps().find((a) => a.name === "arpa") || initializeApp(cfg, "arpa");
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);
  const idToken = await cred.user.getIdToken();
  signOut(auth).catch(() => {}); // ARPA keeps its own session; Firebase session not needed
  return idToken;
}

function firebaseErrorText(e: any): string | null {
  const code = String(e?.code || "");
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null; // user closed it
  if (code === "auth/popup-blocked") return "Popup was blocked — please allow popups for this site.";
  if (code === "auth/unauthorized-domain") return "This website domain is not added in Firebase → Authentication → Settings → Authorized domains.";
  if (code === "auth/operation-not-allowed") return "Google sign-in is not enabled in Firebase → Authentication → Sign-in method.";
  if (code === "auth/network-request-failed") return "Network error — please check your connection.";
  return e?.message || "Google sign-in failed.";
}

function GoogleButton({ clientId, firebase, onAccessToken, onFirebaseToken, disabled, loading }: {
  clientId: string; firebase?: FirebaseCfg | null;
  onAccessToken: (token: string) => void; onFirebaseToken: (idToken: string) => void;
  disabled?: boolean; loading?: boolean;
}) {
  const cbRef = React.useRef(onAccessToken);
  cbRef.current = onAccessToken;
  const clientRef = React.useRef<any>(null);
  const [opening, setOpening] = React.useState(false);

  // preload the Google script so the popup opens instantly on click (popup must open inside the click)
  React.useEffect(() => {
    if (!clientId || firebase) return;
    let cancelled = false;
    loadGsi().then(() => {
      if (cancelled || !window.google?.accounts?.oauth2) return;
      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        prompt: "select_account",
        callback: (r: { access_token?: string; error?: string }) => {
          setOpening(false);
          if (r?.access_token) cbRef.current(r.access_token);
          else if (r?.error) toast.error("Google sign-in was cancelled.");
        },
        error_callback: (e: { type?: string }) => {
          setOpening(false);
          if (e?.type === "popup_failed_to_open") toast.error("Popup was blocked — please allow popups for this site.");
        },
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [clientId, firebase]);

  const onClick = async () => {
    // Firebase Authentication takes priority when configured
    if (firebase) {
      setOpening(true);
      try {
        const idToken = await firebaseGoogleIdToken(firebase);
        onFirebaseToken(idToken);
      } catch (e: any) {
        const msg = firebaseErrorText(e);
        if (msg) toast.error(msg);
      } finally {
        setOpening(false);
      }
      return;
    }
    if (!clientId) {
      toast.error("Google sign-in is not set up yet. Add the FIREBASE_* env values on the server.");
      return;
    }
    if (!clientRef.current) {
      try {
        await loadGsi();
        clientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId, scope: "openid email profile", prompt: "select_account",
          callback: (r: { access_token?: string }) => { setOpening(false); if (r?.access_token) cbRef.current(r.access_token); },
        });
      } catch {
        toast.error("Google Sign-In could not load. Please check your connection and refresh.");
        return;
      }
    }
    setOpening(true);
    clientRef.current.requestAccessToken();
  };

  const busy = loading || opening;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arpa disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-[18px] animate-spin" /> : <GoogleLogo />}
      <span>{busy ? "Signing in…" : "Continue with Google"}</span>
    </button>
  );
}

export function Landing({ config }: { config: AppConfig }) {
  const setSession = useArpa((s) => s.setSession);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [showEmail, setShowEmail] = React.useState(false);

  const googleEnabled = !!config.googleClientId || !!config.firebase;
  const emailEnabled = config.emailLogin ?? !googleEnabled;
  const year = new Date().getFullYear();

  React.useEffect(() => {
    const last = ls.get<string>("arpa_dev_email", "");
    if (last) setEmail(last);
  }, []);

  const trialText = config.tokenLimitFree
    ? `Free ${fmtTokens(config.tokenLimitFree)} chat tokens${tokenPeriodLabel(config.tokenPeriod || "month").replace(" this month", " every month").replace(" today", " every day")}`
    : "Start chatting free";

  const finishLogin = (data: LoginResp, em?: string) => {
    tokenStore.set(data.token);
    if (em) ls.set("arpa_dev_email", em);
    setSession({ user: data.user, sub: data.sub, usedToday: 0 });
    toast.success(`Welcome, ${data.user.name}!`);
  };

  const onFirebase = async (idToken: string) => {
    setLoading(true);
    try {
      const { status, data } = await api<LoginResp>("/api/auth/firebase", {
        method: "POST", body: JSON.stringify({ idToken }),
      });
      if (status !== 200 || !data?.ok) { toast.error(data?.error || "Google sign-in failed."); return; }
      finishLogin(data);
    } catch (err: any) {
      toast.error(err?.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async (accessToken: string) => {
    setLoading(true);
    try {
      const { status, data } = await api<LoginResp>("/api/auth/google", {
        method: "POST", body: JSON.stringify({ accessToken }),
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
                <p className="mt-1 text-sm text-muted-foreground">Sign in with your Google account — no card required.</p>
              </div>

              <div className="mt-6 space-y-4">
                <GoogleButton clientId={config.googleClientId || ""} firebase={config.firebase} onAccessToken={onGoogle} onFirebaseToken={onFirebase} disabled={loading} loading={loading && googleEnabled} />

                {emailEnabled && (
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
