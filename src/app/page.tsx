"use client";
// ARPA V3.3 — main page. The only user-visible route.
// Boots: fetch /api/config, then if a token is present, fetch /api/me.
// Shows: SharedChat (?share=token) | Landing (no session) | ChatApp (session).
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useArpa } from "@/lib/store";
import { api, tokenStore, type AppConfig, type ArpaUser, type SubStatus } from "@/lib/arpa-client";
import { Landing } from "@/components/arpa/landing";
import { ChatApp, BootScreen } from "@/components/arpa/chat-app";
import { SharedChat } from "@/components/arpa/shared-chat";

function HomeInner() {
  const { config, user, booting, setConfig, setSession, setAuthError } = useArpa();
  const searchParams = useSearchParams();
  const shareToken = searchParams.get("share");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // shared chat view — no auth needed, skip booting session
      if (shareToken) {
        try {
          const r = await api<AppConfig>("/api/config");
          if (!cancelled && r.status === 200 && r.data) setConfig(r.data);
        } catch {}
        if (!cancelled) useArpa.setState({ booting: false });
        return;
      }

      // 1. fetch public config
      let cfg: AppConfig | null = null;
      try {
        const r = await api<AppConfig>("/api/config");
        if (r.status === 200 && r.data) cfg = r.data;
      } catch {}
      if (cancelled) return;
      if (!cfg) {
        setAuthError("Could not connect to the server.");
        return;
      }
      setConfig(cfg);

      // 2. if a token is present, try /api/me
      const token = tokenStore.get();
      if (token) {
        const r2 = await api<{ ok: boolean; user: ArpaUser; sub: SubStatus; usedToday: number; error?: string }>("/api/me");
        if (cancelled) return;
        if (r2.status === 200 && r2.data?.ok) {
          setSession({ user: r2.data.user, sub: r2.data.sub, usedToday: r2.data.usedToday });
          return;
        }
        tokenStore.clear();
      }
      useArpa.setState({ booting: false });
    })();
    return () => { cancelled = true; };
  }, [setConfig, setSession, setAuthError, shareToken]);

  // shared chat view takes priority
  if (shareToken && !booting) return <SharedChat token={shareToken} />;

  if (booting || !config) return <BootScreen />;
  if (!user) return <Landing config={config} />;
  return <ChatApp config={config} />;
}

// useSearchParams() needs a Suspense boundary for static prerender (Next.js 15+/16)
export default function Home() {
  return (
    <React.Suspense fallback={<BootScreen />}>
      <HomeInner />
    </React.Suspense>
  );
}
