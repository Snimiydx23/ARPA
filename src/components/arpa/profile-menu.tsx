"use client";
// ARPA V3 — profile menu (bottom of sidebar) + upgrade card.
// Replaces V2's #profBtn menu and #upgCard.
import * as React from "react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, Sparkles, Trash2, FileText, Mail, ChevronDown, Settings2, Download, BarChart3, Archive } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ArpaUser, SubStatus } from "@/lib/arpa-client";

function initials(name: string) {
  return (name || "U").charAt(0).toUpperCase();
}

export function ProfileMenu({
  user,
  sub,
  onPlans,
  onLegal,
  onSettings,
  onStats,
  onArchived,
  onExportCurrent,
  onClearChats,
  onLogout,
}: {
  user: ArpaUser;
  sub: SubStatus;
  onPlans: () => void;
  onLegal: () => void;
  onSettings: () => void;
  onStats: () => void;
  onArchived: () => void;
  onExportCurrent: () => void;
  onClearChats: () => void;
  onLogout: () => void;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const planText =
    sub.state === "paid" ? `Pro · ${new Date(sub.until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` :
    sub.state === "trial" ? `Free trial · ${sub.daysLeft} days` : "Trial ended";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent">
          <Avatar className="size-8 border border-border">
            {user.picture ? <AvatarImage src={user.picture} alt={user.name} referrerPolicy="no-referrer" /> : null}
            <AvatarFallback className="bg-arpa text-arpa-foreground">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{planText}</p>
          </div>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="mb-2 min-w-[240px]">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onPlans}>
          <Sparkles className="mr-2 size-4 text-arpa" />
          {sub.state === "paid" ? "My plan" : "Upgrade plan"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSettings}>
          <Settings2 className="mr-2 size-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onStats}>
          <BarChart3 className="mr-2 size-4" /> My usage
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onArchived}>
          <Archive className="mr-2 size-4" /> Archived chats
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportCurrent}>
          <Download className="mr-2 size-4" /> Export current chat
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(isDark ? "light" : "dark")}>
          {isDark ? <Sun className="mr-2 size-4" /> : <Moon className="mr-2 size-4" />}
          {isDark ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onLegal}>
          <FileText className="mr-2 size-4" /> Terms & Privacy
        </DropdownMenuItem>
        {process.env.NEXT_PUBLIC_SUPPORT_EMAIL && (
          <DropdownMenuItem asChild>
            <a href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
              <Mail className="mr-2 size-4" /> Help / Support
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { if (confirm("Permanently delete all chats?")) onClearChats(); }}>
          <Trash2 className="mr-2 size-4" /> Delete all chats
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>
          <LogOut className="mr-2 size-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UpgradeCard({ sub, onClick }: { sub: SubStatus; onClick: () => void }) {
  if (sub.state === "paid") return null;
  const text = sub.state === "trial" ? `Free trial: ${sub.daysLeft} days left` : "Trial ended — get a plan";
  return (
    <Button
      onClick={onClick}
      variant="outline"
      className="mb-1.5 h-auto w-full items-center gap-2.5 rounded-xl border-dashed py-2.5 text-left text-xs"
    >
      <Sparkles className="size-4 shrink-0 text-arpa" />
      <div className="flex-1">
        <p className="text-sm font-semibold">Upgrade plan</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    </Button>
  );
}
