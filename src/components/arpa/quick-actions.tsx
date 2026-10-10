"use client";
// ARPA V3.1 — Quick action templates for the empty-state.
// Replaces V2's plain suggestion chips with category cards that surface
// templated prompts (Write / Code / Learn / Calculate / Translate / Summarize).
import * as React from "react";
import { PenLine, Code2, GraduationCap, Calculator, Languages, FileText } from "lucide-react";

export type QuickAction = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  color: string; // tailwind text color
  prompt: string;
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "write-email",
    icon: PenLine,
    title: "Email likho",
    desc: "Professional email ya application banao",
    color: "text-arpa",
    prompt: "Ek professional email likho jisme main apne boss se 2 din ki leave mangta hoon. Reason: family function. Email professional aur polite hona chahiye.",
  },
  {
    id: "code",
    icon: Code2,
    title: "Code samjhao",
    desc: "VLOOKUP, Python, JS, Excel formulas",
    color: "text-emerald-500",
    prompt: "Excel me VLOOKUP samjhao with a practical example. Step-by-step, Hindi-Hinglish me.",
  },
  {
    id: "learn",
    icon: GraduationCap,
    title: "Kuch seekho",
    desc: "Naye topic ka simple overview",
    color: "text-amber-500",
    prompt: "Mutual fund kya hota hai? SIP aur lump sum me kya farq hai? Beginner ke liye simple Hindi me samjhao.",
  },
  {
    id: "calculate",
    icon: Calculator,
    title: "EMI / Calculation",
    desc: "Loan, tax, interest calculations",
    color: "text-rose-500",
    prompt: "Main ₹10 lakh ka home loan lena chahta hoon, 8% interest, 20 saal tenure. EMI nikalo aur total interest batao. Working dikhao.",
  },
  {
    id: "translate",
    icon: Languages,
    title: "Translate karo",
    desc: "Hindi ↔ English ↔ Hinglish",
    color: "text-cyan-500",
    prompt: "Mujhe 'How are you doing today? I hope everything is going well.' ka Hindi aur Hinglish dono me translation chahiye.",
  },
  {
    id: "summarize",
    icon: FileText,
    title: "Summarize karo",
    desc: "Long text ko short points me",
    color: "text-violet-500",
    prompt: "Main ek long article paste karunga. Uske 5 main points bullet form me likho, aur ek line ka summary do. (Abhi article paste karo)",
  },
];

export function QuickActions({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto mt-8 grid max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {QUICK_ACTIONS.map((a) => (
        <button
          key={a.id}
          onClick={() => onPick(a.prompt)}
          className="group flex items-start gap-3 rounded-xl border border-border/70 bg-card/60 p-3.5 text-left transition-all hover:border-arpa/40 hover:shadow-md hover:-translate-y-0.5"
        >
          <div className={`grid size-9 shrink-0 place-items-center rounded-lg bg-muted ${a.color} transition-transform group-hover:scale-110`}>
            <a.icon className="size-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{a.title}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{a.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
