"use client";
// ARPA V3.3 — chat app shell.
// V3.1: settings, voice input, TTS, pin chats, message editing, export, quick-actions, scroll btn, Ctrl+K.
// V3.2: web search panel, image attach (VLM), usage stats dashboard, onboarding tour, chat branching.
// V3.3: chat sharing (public link), conversation tags, command palette (Cmd+/), share/tags dialogs.
import * as React from "react";
import { toast } from "sonner";
import { Menu, Plus, Sparkles, CalendarClock, Loader2, ArrowDown, Download, Settings2, Command, Share2, Search, Bot, Keyboard, Bookmark, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useArpa, selectCurChat } from "@/lib/store";
import {
  api, streamChat, uid, modelStore, tokenStore, settingsStore, chatToMarkdown, chatToJson, downloadFile, printChat, fmtDate,
  type Chat, type ChatMsg, type SubStatus, type AppConfig,
} from "@/lib/arpa-client";
import { Sidebar, deleteChat, renameChat, pinChat } from "./sidebar";
import { MessageBubble } from "./message-bubble";
import { Composer } from "./composer";
import { ModelSelector } from "./model-selector";
import { PlansModal } from "./plans-modal";
import { LegalModal } from "./legal-modal";
import { ProfileMenu, UpgradeCard } from "./profile-menu";
import { SettingsDialog } from "./settings-dialog";
import { StatsDialog } from "./stats-dialog";
import { SearchPanel } from "./search-panel";
import { Onboarding } from "./onboarding";
import { ShareDialog } from "./share-dialog";
import { TagsDialog } from "./tags-dialog";
import { CommandPalette } from "./command-palette";
import { InChatSearch } from "./in-chat-search";
import { ChatSettingsDialog } from "./chat-settings-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { ArchivedDialog } from "./archived-dialog";
import { TemplatesDialog } from "./templates-dialog";
import { DateSeparator } from "./date-separator";
import { GlobalSearchDialog } from "./global-search-dialog";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// V3.4: rotating tips shown in the empty-state hero
const TIPS = [
  "💡 Tip: Press Ctrl+K for a new chat, Ctrl+/ to open the command palette",
  "💡 Tip: Use the mic to dictate, and the speaker to hear ARPA's reply",
  "💡 Tip: Upload an image and get a description (VLM)",
  "💡 Tip: Use the globe for live web search, sent right into the chat",
  "💡 Tip: Use GitFork to branch off from any message",
  "💡 Tip: Use Share to create a public read-only link for a chat",
  "💡 Tip: Add tags to organize your chats",
  "💡 Tip: In Settings, change the temperature to control creativity",
];

function RotatingTip() {
  const [idx, setIdx] = React.useState(() => Math.floor(Math.random() * TIPS.length));
  React.useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % TIPS.length), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <p key={idx} className="animate-msg-in mt-2 max-w-md text-center text-sm text-muted-foreground">
      {TIPS[idx]}
    </p>
  );
}

export function ChatApp({ config }: { config: AppConfig }) {
  const {
    user, sub, usedToday, chats, curId, model, busy, ctrl,
    setSub, setChats, setCurId, setModel, setBusy,
    upsertChat, patchChat, removeChat, curChat,
  } = useArpa();

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [plansOpen, setPlansOpen] = React.useState(false);
  const [legalOpen, setLegalOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [statsOpen, setStatsOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [targetChat, setTargetChat] = React.useState<Chat | null>(null);
  const [chatSearchOpen, setChatSearchOpen] = React.useState(false);
  const [chatSearchQuery, setChatSearchQuery] = React.useState("");
  const [chatSearchMatch, setChatSearchMatch] = React.useState(0);
  const [chatSettingsOpen, setChatSettingsOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [archivedOpen, setArchivedOpen] = React.useState(false);
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = React.useState(false);
  const [legalTab, setLegalTab] = React.useState<"terms" | "privacy" | "refund" | "contact">("terms");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = React.useState(true);

  // set initial model from localStorage or first model
  React.useEffect(() => {
    if (!model) {
      const saved = modelStore.get();
      const m = (config.models || []).find((x) => x.id === saved) || config.models[0];
      if (m) {
        setModel(m.id);
        modelStore.set(m.id);
      }
    }
  }, [config.models, model, setModel]);

  // load chats on mount
  React.useEffect(() => {
    (async () => {
      const { status, data } = await api<{ ok: boolean; chats: Chat[] }>("/api/chats");
      if (status === 200 && data?.ok) {
        setChats(data.chats);
      }
    })();
  }, [setChats]);

  // keyboard shortcuts: Cmd/Ctrl+K = new chat, Cmd/Ctrl+/ = command palette, Cmd/Ctrl+F = in-chat search
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (busy) ctrl?.abort();
        setCurId(null);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setChatSearchOpen(true);
      } else if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, ctrl, setCurId]);

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 140);
  };

  React.useEffect(() => {
    if (nearBottom) scrollToBottom();
  }, [curChat()?.msgs, nearBottom, scrollToBottom]);

  const c = curChat();
  const fresh = !c || c.msgs.length === 0;

  // V3.4: in-chat search — compute which message indices match the query
  const searchMatches = React.useMemo(() => {
    if (!c || !chatSearchQuery || chatSearchQuery.length < 2) return [] as number[];
    const q = chatSearchQuery.toLowerCase();
    const hits: number[] = [];
    c.msgs.forEach((m, i) => {
      if ((m.content || "").toLowerCase().includes(q)) hits.push(i);
    });
    return hits;
  }, [c, chatSearchQuery]);

  const curMatchIdx = searchMatches[Math.min(chatSearchMatch, searchMatches.length - 1)] ?? -1;

  // scroll to the current match
  const scrollToMatch = React.useCallback((idx: number) => {
    if (idx < 0) return;
    const el = document.querySelector(`[data-msg-idx="${idx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // ----- send / stream -----
  const send = (
    text: string,
    img?: { image: string; thumb: string; more?: string[]; name?: string },
    file?: { name: string; text: string; size: number; pages?: number; truncated?: boolean },
  ) => {
    if (busy || !sub || sub.state === "expired") return;
    let chat = c;
    const isNewChat = !chat;
    if (!chat) {
      chat = { id: uid(), title: text.replace(/\s+/g, " ").slice(0, 50), msgs: [], at: Date.now() };
      upsertChat(chat);
      setCurId(chat.id);
    }
    const chatId = chat.id;
    const userMsg: ChatMsg = { role: "user", content: text };
    if (img) { userMsg.image = img.image; userMsg.thumb = img.thumb; if (img.more?.length) userMsg.images = img.more; }
    if (img?.name && !file) userMsg.content = `${text}\n\n(Attached: ${img.name})`;
    if (file) userMsg.file = file;
    const aiMsg: ChatMsg = { role: "assistant", content: "", streaming: true, model };
    const newMsgs = [...chat.msgs, userMsg, aiMsg];
    patchChat(chatId, { msgs: newMsgs, at: Date.now() });
    run(chatId, newMsgs, aiMsg, model);
    // V3.6: auto-generate a better title for new chats after the first message
    if (isNewChat) {
      api<{ ok: boolean; title?: string }>("/api/chat-title", {
        method: "POST", body: JSON.stringify({ text }),
      }).then(({ status, data }) => {
        if (status === 200 && data?.ok && data.title) {
          patchChat(chatId, { title: data.title });
          api("/api/chats", {
            method: "POST",
            body: JSON.stringify({ id: chatId, title: data.title, at: Date.now(), msgs: newMsgs.filter((m) => !m.streaming) }),
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  };

  // edit a user message at index `i` — truncate everything after, regenerate
  const onEditMessage = (i: number, newText: string) => {
    if (busy || !c) return;
    const target = c.msgs[i];
    if (!target || target.role !== "user") return;
    const kept = c.msgs.slice(0, i); // messages before the edited one
    const editedUser: ChatMsg = { ...target, content: newText, edited: true };
    const aiMsg: ChatMsg = { role: "assistant", content: "", streaming: true, model };
    const newMsgs = [...kept, editedUser, aiMsg];
    patchChat(c.id, { msgs: newMsgs, at: Date.now() });
    run(c.id, newMsgs, aiMsg, model);
  };

  const run = async (chatId: string, msgs: ChatMsg[], aiMsg: ChatMsg, modelId: string) => {
    const ac = new AbortController();
    setBusy(true, ac);
    const t0 = Date.now();
    const base = msgs.slice(0, -1).filter((m) => !m.error && m.content);
    // send only the most recent image (full-size if still in memory, else the saved thumbnail)
    let lastImgIdx = -1;
    base.forEach((m, i) => { if (m.role === "user" && (m.image || m.thumb)) lastImgIdx = i; });
    const hist = base.map((m, i) =>
      i === lastImgIdx
        ? { role: m.role, content: m.content, image: m.image || m.thumb, images: m.images, file: m.file ? { name: m.file.name, text: m.file.text } : undefined }
        : {
            role: m.role,
            content: (m.image || m.thumb) ? m.content + "\n[an image was attached here earlier]" : m.content,
            file: m.file ? { name: m.file.name, text: m.file.text } : undefined,
          }
    );

    const settings = settingsStore.get();
    // V3.5: fetch the chat's custom systemPrompt before the request
    const chatBeforeRun = useArpa.getState().chats.find((x) => x.id === chatId);
    const customSystemPrompt = chatBeforeRun?.systemPrompt;

    let content = "";
    let errored: string | null = null;
    let code: string | undefined;
    let cut = false;
    let usedModel = modelId;

    try {
      const { response } = await streamChat(
        { messages: hist, model: modelId, temperature: settings.temperature, systemPrompt: customSystemPrompt },
        ac.signal
      );
      if (response.status === 401) throw new Error("Session expired — please log in again.");
      if (!response.ok || !response.body) {
        const d = await response.json().catch(() => ({}));
        if (d.code === "EXPIRED") {
          setSub({ ...sub!, state: "expired", daysLeft: 0 });
        }
        const err = new Error(d.error || `Server error ${response.status}`);
        (err as any).code = d.code;
        throw err;
      }
      usedModel = response.headers.get("x-arpa-model") || modelId;
      const usedHdr = Number(response.headers.get("x-arpa-used"));
      const limitHdr = Number(response.headers.get("x-arpa-limit"));
      if (usedHdr && limitHdr) {
        useArpa.setState((s) => ({ usedToday: usedHdr, sub: s.sub ? { ...s.sub, limit: limitHdr } : s.sub }));
      }

      const reader = response.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let pending = false;
      const paint = () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          const state = useArpa.getState();
          const ch = state.chats.find((x) => x.id === chatId);
          if (!ch) return;
          const idx = ch.msgs.length - 1;
          const m = ch.msgs[idx];
          if (!m || !m.streaming) return;
          const updated = [...ch.msgs];
          updated[idx] = { ...m, content, model: usedModel };
          state.patchChat(chatId, { msgs: updated });
          if (nearBottom) scrollToBottom();
        });
      };

      const pump = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const ln of lines) {
          const t = ln.trim();
          if (!t.startsWith("data:")) continue;
          const d = t.slice(5).trim();
          if (!d || d === "[DONE]") return;
          let j: any;
          try { j = JSON.parse(d); } catch { continue; }
          if (j.error) { errored = j.error.message || "Stream error"; continue; }
          const ch = j.choices?.[0];
          if (ch?.delta?.content) { content += ch.delta.content; paint(); }
          if (ch?.finish_reason === "length") cut = true;
        }
        return pump();
      };
      await pump();
    } catch (e: any) {
      if (e?.name === "AbortError") {
        if (!content) errored = "Stopped.";
        else cut = true;
      } else if (!content) {
        errored = e?.message || "Network error";
        code = e?.code;
      } else {
        cut = true;
      }
    }

    const finalMsg: ChatMsg = {
      ...aiMsg,
      content: content || aiMsg.content,
      streaming: false,
      model: usedModel,
      ms: Date.now() - t0,
      cut,
      ...(errored ? { error: errored, code } : {}),
    };
    const state = useArpa.getState();
    const ch = state.chats.find((x) => x.id === chatId);
    if (ch) {
      const updated = [...ch.msgs];
      updated[updated.length - 1] = finalMsg;
      state.patchChat(chatId, { msgs: updated, at: Date.now() });
      api("/api/chats", {
        method: "POST",
        body: JSON.stringify({ id: chatId, title: ch.title, at: Date.now(), msgs: updated.filter((m) => !m.streaming), pinned: !!ch.pinned }),
      }).catch(() => {});
    }
    setBusy(false, null);
  };

  const stop = () => { ctrl?.abort(); };

  const newChat = () => {
    if (busy) stop();
    setCurId(null);
    setSheetOpen(false);
  };

  const pickChat = (id: string) => {
    if (busy) stop();
    setCurId(id);
    setSheetOpen(false);
    requestAnimationFrame(scrollToBottom);
  };

  const onDelete = async (id: string) => {
    await deleteChat(id, () => {
      removeChat(id);
      if (curId === id) setCurId(null);
    });
  };

  const onRename = async (id: string, title: string) => {
    await renameChat(id, title, () => {
      patchChat(id, { title });
    });
  };

  const onPin = async (id: string, pinned: boolean) => {
    await pinChat(id, pinned, () => {
      patchChat(id, { pinned });
      // re-sort: pinned first
      const state = useArpa.getState();
      const sorted = [...state.chats].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.at - a.at);
      state.setChats(sorted);
    });
  };

  const exportChat = (id: string) => {
    const chat = chats.find((x) => x.id === id);
    if (!chat) { toast.error("Chat not found"); return; }
    const md = chatToMarkdown(chat.title, chat.msgs);
    const safe = chat.title.replace(/[^a-z0-9\-]+/gi, "-").slice(0, 40).toLowerCase() || "chat";
    downloadFile(`${safe}.md`, md, "text/markdown");
    toast.success("Chat exported (.md)");
  };

  // V3.10: JSON export (backup format with metadata)
  const exportChatJson = (id: string) => {
    const chat = chats.find((x) => x.id === id);
    if (!chat) { toast.error("Chat not found"); return; }
    const json = chatToJson(chat.title, chat.msgs);
    const safe = chat.title.replace(/[^a-z0-9\-]+/gi, "-").slice(0, 40).toLowerCase() || "chat";
    downloadFile(`${safe}.json`, json, "application/json");
    toast.success("Chat exported (.json)");
  };

  const exportCurrent = () => {
    if (!c) { toast.error("No chat open right now"); return; }
    exportChat(c.id);
  };

  // V3.9: print/PDF export
  const printCurrent = () => {
    if (!c) { toast.error("No chat open right now"); return; }
    const clean = c.msgs.filter((m) => !m.streaming && (m.content || m.error));
    if (clean.length === 0) { toast.error("Chat is empty"); return; }
    const ok = printChat(c.title, clean);
    if (ok) toast.success("Print dialog opened — choose 'Save as PDF' there");
    else toast.error("Popup was blocked — please allow it");
  };

  // V3.2: branch (fork) from a message index — copies msgs[0..i] into a new chat
  const onBranch = (i: number) => {
    if (!c) return;
    const upto = c.msgs.slice(0, i + 1).filter((m) => !m.streaming && (m.content || m.error));
    if (upto.length === 0) { toast.error("No message to branch from"); return; }
    const newId = uid();
    const newChat: Chat = {
      id: newId,
      title: (c.title + " (branch)").slice(0, 80),
      msgs: upto,
      at: Date.now(),
      pinned: false,
    };
    upsertChat(newChat);
    setCurId(newId);
    api("/api/chats", {
      method: "POST",
      body: JSON.stringify({ id: newId, title: newChat.title, at: Date.now(), msgs: upto }),
    }).catch(() => {});
    toast.success("Branch created — new chat");
  };

  // V3.7: duplicate an entire chat (full copy of msgs + persona)
  const onDuplicate = (chat: Chat) => {
    const cleanMsgs = chat.msgs.filter((m) => !m.streaming && (m.content || m.error));
    const newId = uid();
    const newChat: Chat = {
      id: newId,
      title: (chat.title + " (copy)").slice(0, 80),
      msgs: cleanMsgs,
      at: Date.now(),
      pinned: false,
      systemPrompt: chat.systemPrompt,
      tags: chat.tags,
    };
    upsertChat(newChat);
    setCurId(newId);
    api("/api/chats", {
      method: "POST",
      body: JSON.stringify({ id: newId, title: newChat.title, at: Date.now(), msgs: cleanMsgs, systemPrompt: chat.systemPrompt || "" }),
    }).catch(() => {});
    toast.success("Chat duplicated");
  };

  // V3.7: set a reaction (up/down/none) on a message
  const onReaction = (i: number, reaction: "up" | "down" | null) => {
    if (!c) return;
    const updated = [...c.msgs];
    const m = updated[i];
    if (!m) return;
    updated[i] = { ...m, reaction };
    patchChat(c.id, { msgs: updated });
    api("/api/chats", {
      method: "POST",
      body: JSON.stringify({ id: c.id, title: c.title, at: Date.now(), msgs: updated.filter((x) => !x.streaming) }),
    }).catch(() => {});
    if (reaction === "up") toast.success("👍 Good response noted");
    else if (reaction === "down") toast.info("👎 Thanks for the feedback");
  };

  // V3.4: regen accepts optional model override for "regenerate with different model"
  const onRegen = (modelOverride?: string) => {
    if (busy || !c) return;
    const last = c.msgs[c.msgs.length - 1];
    if (last?.role === "assistant") {
      const trimmed = c.msgs.slice(0, -1);
      const useModel = modelOverride || model;
      patchChat(c.id, { msgs: trimmed });
      const aiMsg: ChatMsg = { role: "assistant", content: "", streaming: true, model: useModel };
      const newMsgs = [...trimmed, aiMsg];
      patchChat(c.id, { msgs: newMsgs });
      run(c.id, newMsgs, aiMsg, useModel);
    }
  };

  const onClearAll = async () => {
    await Promise.all(chats.map((c) => api(`/api/chats/${c.id}`, { method: "DELETE" })));
    setChats([]);
    setCurId(null);
    toast.success("All chats deleted");
  };

  const onLogout = () => {
    if (busy) stop();
    tokenStore.clear();
    useArpa.setState({ user: null, sub: null, chats: [], curId: null });
    toast.success("Logged out");
  };

  const onContinue = () => {
    if (sub?.state === "expired") {
      setPlansOpen(true);
      return;
    }
    send("Continue — pick up where you left off, without repeating yourself.");
  };

  if (!user || !sub) return null;

  const locked = sub.state === "expired";

  // shared sidebar props
  // V3.3: open share / tags dialogs with the picked chat as target
  const openShare = (chat: Chat) => { setTargetChat(chat); setShareOpen(true); };
  const openTags = (chat: Chat) => { setTargetChat(chat); setTagsOpen(true); };
  const openChatSettings = (chat: Chat) => { setTargetChat(chat); setChatSettingsOpen(true); };

  const sidebarProps = {
    chats,
    curId,
    onPick: pickChat,
    onNew: newChat,
    onDelete: onDelete,
    onRename: onRename,
    onPin: onPin,
    onExport: exportChat,
    onExportJson: exportChatJson,
    onShare: openShare,
    onTags: openTags,
    onChatSettings: openChatSettings,
    onDuplicate: onDuplicate,
    onGlobalSearch: () => setGlobalSearchOpen(true),
    streamingChatId: busy ? curId : null,
  };

  // shared profile props
  const profileProps = {
    user,
    sub,
    onPlans: () => setPlansOpen(true),
    onLegal: () => { setLegalTab("terms"); setLegalOpen(true); },
    onSettings: () => setSettingsOpen(true),
    onStats: () => setStatsOpen(true),
    onArchived: () => setArchivedOpen(true),
    onExportCurrent: exportCurrent,
    onClearChats: onClearAll,
    onLogout: onLogout,
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* desktop sidebar */}
      <aside className="hidden w-[270px] shrink-0 border-r border-sidebar-border md:flex md:flex-col">
        <Sidebar {...sidebarProps} />
        <div className="border-t border-sidebar-border p-2">
          {sub.state !== "paid" && <UpgradeCard sub={sub} onClick={() => setPlansOpen(true)} />}
          <ProfileMenu {...profileProps} />
        </div>
      </aside>

      {/* mobile sidebar (sheet) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
          <SheetTitle className="sr-only">Mobile sidebar</SheetTitle>
          <SheetDescription className="sr-only">Chat history and profile menu</SheetDescription>
          <div className="flex h-full flex-col">
            <Sidebar {...sidebarProps} onClose={() => setSheetOpen(false)} />
            <div className="border-t border-sidebar-border p-2">
              {sub.state !== "paid" && <UpgradeCard sub={sub} onClick={() => { setPlansOpen(true); setSheetOpen(false); }} />}
              <ProfileMenu {...profileProps} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="flex h-14 items-center gap-1.5 px-2.5 sm:px-3">
          <Button
            size="icon"
            variant="ghost"
            className="md:hidden"
            onClick={() => setSheetOpen(true)}
            title="Menu"
          >
            <Menu className="size-5" />
          </Button>
          <ModelSelector models={config.models} value={model} onChange={(id) => { setModel(id); modelStore.set(id); }} />
          <div className="flex-1" />
          {/* command palette trigger (looks like a search bar on desktop) */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted md:flex"
            title="Command palette (Ctrl+/)"
          >
            <Command className="size-3.5" />
            <span>Search…</span>
            <kbd className="rounded border border-border bg-background px-1 py-0 text-[10px]">Ctrl /</kbd>
          </button>
          {sub.state !== "paid" && (sub.state === "expired" || sub.daysLeft <= 15) && (
            <Button
              size="sm"
              className="hidden bg-arpa-soft text-arpa hover:bg-arpa-soft hover:opacity-90 sm:inline-flex"
              onClick={() => setPlansOpen(true)}
            >
              <Sparkles className="size-3.5" /> Upgrade
            </Button>
          )}
          {c && (
            <Button size="icon" variant="ghost" onClick={() => openShare(c)} title="Share chat" className="hidden sm:inline-flex">
              <Share2 className="size-4" />
            </Button>
          )}
          {c && (
            <Button size="icon" variant="ghost" onClick={printCurrent} title="Print / Save as PDF" className="hidden sm:inline-flex">
              <Printer className="size-4" />
            </Button>
          )}
          {c && (
            <Button size="icon" variant="ghost" onClick={exportCurrent} title="Export chat (.md)" className="hidden sm:inline-flex">
              <Download className="size-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+/)" className="md:hidden">
            <Command className="size-4" />
          </Button>
          {c && (
            <Button size="icon" variant="ghost" onClick={() => setChatSearchOpen(true)} title="Search in chat (Ctrl+F)">
              <Search className="size-4" />
            </Button>
          )}
          {c && (
            <Button size="icon" variant="ghost" onClick={() => { setTargetChat(c); setChatSettingsOpen(true); }} title="Chat persona & settings" className={c.systemPrompt ? "text-arpa" : ""}>
              <Bot className="size-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => setTemplatesOpen(true)} title="Prompt templates">
            <Bookmark className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts (?)">
            <Keyboard className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setSettingsOpen(true)} title="Settings">
            <Settings2 className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={newChat} title="New chat (Ctrl+K)">
            <Plus className="size-5" />
          </Button>
        </header>

        {/* usage badge */}
        {sub.state !== "expired" && (
          <div className="flex justify-center pb-1">
            <Badge variant="secondary" className="gap-1.5 text-xs font-normal">
              <CalendarClock className="size-3" />
              {usedToday}/{sub.limit} today
              {sub.state === "trial" && ` · ${sub.daysLeft} days left`}
            </Badge>
          </div>
        )}

        {/* thread */}
        <div className="relative">
          <InChatSearch
            open={chatSearchOpen}
            query={chatSearchQuery}
            onQuery={(q) => { setChatSearchQuery(q); setChatSearchMatch(0); }}
            onClose={() => { setChatSearchOpen(false); setChatSearchQuery(""); }}
            matchCount={searchMatches.length}
            curMatch={Math.min(chatSearchMatch, Math.max(0, searchMatches.length - 1))}
            onPrev={() => {
              const next = (chatSearchMatch - 1 + searchMatches.length) % Math.max(1, searchMatches.length);
              setChatSearchMatch(next);
              scrollToMatch(searchMatches[next]);
            }}
            onNext={() => {
              const next = (chatSearchMatch + 1) % Math.max(1, searchMatches.length);
              setChatSearchMatch(next);
              scrollToMatch(searchMatches[next]);
            }}
          />
        </div>
        <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin flex-1 overflow-y-auto">
          {fresh ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-1 flex-col items-center justify-center px-4 pt-8">
                <div className="arpa-zoom mb-3 grid size-12 place-items-center rounded-2xl bg-arpa text-xl font-extrabold text-arpa-foreground shadow-lg shadow-arpa/20">A</div>
                <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
                  {greeting()}{user.name ? `, ${user.name.split(" ")[0]}` : ""}. How can I help you today?
                </h2>
                <RotatingTip />
              </div>
            </div>
          ) : c ? (
            <div className="mx-auto max-w-3xl px-4 pb-6 pt-3 sm:px-5">
              {c.msgs.map((m, i) => {
                // V3.8: date separator — show before a message if the day changed
                // relative to the previous message. Use chat.at as a proxy timestamp.
                const showSep = i === 0;
                return (
                  <React.Fragment key={i}>
                    {showSep && <DateSeparator t={c.at} />}
                    <div data-msg-idx={i}>
                      <MessageBubble
                        msg={m}
                        isLast={i === c.msgs.length - 1}
                        onRegen={onRegen}
                        models={config.models}
                        curModel={model}
                        onContinue={m.error ? () => setPlansOpen(true) : undefined}
                        onEdit={m.role === "user" ? (newText) => onEditMessage(i, newText) : undefined}
                        onBranch={() => onBranch(i)}
                        onReaction={m.role === "assistant" ? (r) => onReaction(i, r) : undefined}
                        searchQuery={chatSearchOpen ? chatSearchQuery : undefined}
                      />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* scroll-to-bottom floating button */}
        {!nearBottom && (
          <Button
            onClick={scrollToBottom}
            size="icon"
            variant="secondary"
            className="absolute bottom-28 left-1/2 z-20 size-9 -translate-x-1/2 rounded-full border border-border bg-card shadow-md transition-all hover:shadow-lg"
            title="Scroll to bottom"
          >
            <ArrowDown className="size-4" />
          </Button>
        )}

        {/* composer */}
        <Composer
          busy={busy}
          disabled={!sub || sub.state === "expired"}
          locked={locked}
          lockText="Free trial has ended"
          lockSub="Choose a plan to keep chatting."
          onSend={send}
          onStop={stop}
          onPlans={() => setPlansOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onSearch={() => setSearchOpen(true)}
        />
      </main>

      {/* modals */}
      <PlansModal
        open={plansOpen}
        onOpenChange={setPlansOpen}
        sub={sub}
        plans={config.plans}
        onPaid={(s) => { setSub(s); }}
      />
      <LegalModal open={legalOpen} onOpenChange={setLegalOpen} initial={legalTab} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <StatsDialog open={statsOpen} onOpenChange={setStatsOpen} sub={sub} />
      <SearchPanel open={searchOpen} onOpenChange={setSearchOpen} config={config} onPick={(t) => send(t)} />
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        chat={targetChat}
        onUpdated={(patch) => {
          if (targetChat) patchChat(targetChat.id, patch);
        }}
      />
      <TagsDialog
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        chat={targetChat}
        onUpdated={(tags) => {
          if (targetChat) patchChat(targetChat.id, { tags });
        }}
      />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNewChat={newChat}
        onSettings={() => setSettingsOpen(true)}
        onStats={() => setStatsOpen(true)}
        onPlans={() => setPlansOpen(true)}
      />
      <ChatSettingsDialog
        open={chatSettingsOpen}
        onOpenChange={setChatSettingsOpen}
        chat={targetChat}
        onUpdated={(patch) => {
          if (targetChat) {
            patchChat(targetChat.id, patch);
            // if archived, remove from list and clear current
            if (patch.archived) {
              setTimeout(() => {
                useArpa.setState((s) => ({
                  chats: s.chats.filter((x) => x.id !== targetChat.id),
                  curId: s.curId === targetChat.id ? null : s.curId,
                }));
              }, 300);
            }
          }
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <TemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onPick={(text) => {
          // insert into composer via a custom event — composer listens for it
          window.dispatchEvent(new CustomEvent("arpa-insert-text", { detail: text }));
        }}
      />
      <GlobalSearchDialog
        open={globalSearchOpen}
        onOpenChange={setGlobalSearchOpen}
        onPickChat={(id) => pickChat(id)}
      />
      <ArchivedDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
        onRestored={(chat) => {
          // only add if not already in the list (avoid duplicate key warnings)
          const state = useArpa.getState();
          if (!state.chats.find((x) => x.id === chat.id)) {
            const sorted = [...state.chats, chat].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.at - a.at);
            state.setChats(sorted);
          }
        }}
        onDeleted={() => {}}
      />
      <Onboarding />
    </div>
  );
}

export function BootScreen() {
  return (
    <div className="grid h-dvh place-items-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin text-arpa" />
    </div>
  );
}

export { fmtDate };
