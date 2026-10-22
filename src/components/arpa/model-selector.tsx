"use client";
// ARPA — model picker (top bar). Shows routing policies (Auto / Fast / Balanced / Best quality)
// and every configured model from the AI Gateway registry.
import { Check, ChevronsUpDown, Cpu, Eye, Brain, Sparkles, Zap, Scale, Gem, Bot } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Model } from "@/lib/arpa-client";

const POLICY_INFO: Record<string, { sub: string; Icon: typeof Cpu }> = {
  auto: { sub: "Picks the best model for each message", Icon: Sparkles },
  fast: { sub: "Quickest replies", Icon: Zap },
  balanced: { sub: "Good mix of speed and depth", Icon: Scale },
  quality: { sub: "Deepest reasoning, slower", Icon: Gem },
  agent: { sub: "Plans steps, uses web, files & calculator", Icon: Bot },
};

const PROVIDER_LABEL: Record<string, string> = {
  nvidia: "NVIDIA", openai: "OpenAI", anthropic: "Anthropic", google: "Google", groq: "Groq",
  openrouter: "OpenRouter", ollama: "Local", custom: "Custom",
};

export function ModelSelector({
  models,
  value,
  onChange,
}: {
  models: Model[];
  value: string;
  onChange: (id: string) => void;
}) {
  const cur = models.find((m) => m.id === value) || models[0];
  if (!cur) return null;
  const policies = models.filter((m) => m.kind === "policy");
  const concrete = models.filter((m) => m.kind !== "policy");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-1.5 px-2 text-base font-semibold hover:bg-muted" aria-label={`Model: ${cur.label}`}>
          <Cpu className="size-4 text-arpa" />
          {cur.kind === "policy" ? `ARPA ${cur.label}` : cur.label}
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] min-w-[280px] overflow-y-auto">
        {policies.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Smart routing</DropdownMenuLabel>
            {policies.map((m) => {
              const info = POLICY_INFO[m.id] || { sub: "", Icon: Cpu };
              return (
                <DropdownMenuItem key={m.id} onSelect={() => onChange(m.id)} className="flex items-center gap-2.5">
                  <info.Icon className="size-4 text-arpa" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{info.sub}</p>
                  </div>
                  {m.id === value && <Check className="size-4 text-arpa" />}
                </DropdownMenuItem>
              );
            })}
            {concrete.length > 0 && <DropdownMenuSeparator />}
          </>
        )}
        {concrete.length > 0 && <DropdownMenuLabel className="text-xs text-muted-foreground">Models</DropdownMenuLabel>}
        {concrete.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => onChange(m.id)} className="flex items-center gap-2.5">
            <Cpu className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">{m.label}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {m.provider ? PROVIDER_LABEL[m.provider] || m.provider : "ARPA model"}
                {m.vision && <span className="inline-flex items-center gap-0.5"><Eye className="size-3" /> vision</span>}
                {m.reasoning && <span className="inline-flex items-center gap-0.5"><Brain className="size-3" /> reasoning</span>}
              </p>
            </div>
            {m.id === value && <Check className="size-4 text-arpa" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
