"use client";
// ARPA V3 — model selector dropdown (top bar).
// Replaces V2's #mdlBtn menu. Uses shadcn DropdownMenu.
import { Check, ChevronsUpDown, Cpu } from "lucide-react";
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

const SUBTITLES = [
  "Smartest — deep answers",
  "Fast — short, quick answers",
  "Light — quick drafts",
];

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-1.5 px-2 text-base font-semibold hover:bg-muted">
          <Cpu className="size-4 text-arpa" />
          {cur.label}
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[260px]">
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {models.map((m, i) => (
          <DropdownMenuItem key={m.id} onSelect={() => onChange(m.id)} className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-sm font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">{SUBTITLES[i] || "ARPA model"}</p>
            </div>
            {m.id === value && <Check className="size-4 text-arpa" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
