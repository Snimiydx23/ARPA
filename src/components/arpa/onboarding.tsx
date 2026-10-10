"use client";
// ARPA V3.2 — First-login onboarding coach marks.
// Shows 4 highlight steps over the chat app. Dismissed via localStorage flag.
import * as React from "react";
import { ArrowRight, X, Sparkles, Mic, ImagePlus, Globe, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const ONBOARD_KEY = "arpa_onboarded_v32";

const STEPS = [
  {
    icon: Sparkles,
    title: "Welcome to ARPA!",
    body: "Ask anything in English, Hindi, or Hinglish. Use a template or type your own question.",
    color: "text-arpa",
  },
  {
    icon: Globe,
    title: "Live web search",
    body: "Use the Globe icon in the composer to look up the latest news, rates, or live info and send results into the chat.",
    color: "text-cyan-500",
  },
  {
    icon: ImagePlus,
    title: "Understand images",
    body: "Use the ImagePlus icon to upload any photo — ARPA will give a description, OCR, and details.",
    color: "text-emerald-500",
  },
  {
    icon: Mic,
    title: "Voice input + Read aloud",
    body: "Hold the mic to start speaking. You can also press the speaker icon on AI replies to listen.",
    color: "text-rose-500",
  },
  {
    icon: Settings2,
    title: "Customize in Settings",
    body: "Set temperature (creativity), TTS voice, and speed to your liking. Press Cmd/Ctrl+K for a new chat.",
    color: "text-amber-500",
  },
];

export function Onboarding() {
  const [step, setStep] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const done = window.localStorage.getItem(ONBOARD_KEY);
    if (!done) {
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try { window.localStorage.setItem(ONBOARD_KEY, "1"); } catch {}
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else dismiss();
  };

  if (!open) return null;
  const cur = STEPS[step];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="animate-msg-in w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <button onClick={dismiss} className="float-right -mt-1 -mr-1 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
          <X className="size-4" />
        </button>
        <div className={`grid size-12 place-items-center rounded-xl bg-muted ${cur.color} mb-3`}>
          <cur.icon className="size-6" />
        </div>
        <h3 className="text-lg font-semibold">{cur.title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{cur.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-arpa" : "w-1.5 bg-muted-foreground/40"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>Back</Button>}
            <Button size="sm" onClick={next} className="bg-arpa text-arpa-foreground hover:opacity-90">
              {step === STEPS.length - 1 ? "Got it!" : "Next"}
              <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
        <button onClick={dismiss} className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground">
          Skip tour
        </button>
      </div>
    </div>
  );
}
