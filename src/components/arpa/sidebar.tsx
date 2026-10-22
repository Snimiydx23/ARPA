"use client";
// ARPA V3.3 — sidebar with chat history, pin support, tags, share.
import * as React from "react";
import { toast } from "sonner";
import { Search, Plus, MoreHorizontal, Pencil, Trash2, X, MessageSquare, Pin, PinOff, Download, Share2, Tag as TagIcon, Filter, Bot, Archive, Copy, Globe, FileJson, FolderInput, FolderMinus, ChevronLeft, Settings2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { api, type Chat, type Project } from "@/lib/arpa-client";

function grpName(t: number) {
  const now = new Date();
  const day = 86400000;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= start) return "Today";
  if (t >= start - day) return "Yesterday";
  if (t >= start - 7 * day) return "Previous 7 days";
  if (t >= start - 30 * day) return "Previous 30 days";
  return new Date(t).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export function Sidebar({
  chats,
  curId,
  onPick,
  onNew,
  onDelete,
  onRename,
  onPin,
  onExport,
  onExportJson,
  onShare,
  onTags,
  onChatSettings,
  onDuplicate,
  onGlobalSearch,
  streamingChatId,
  onClose,
  projects = [],
  curProjectId = null,
  onPickProject,
  onNewProject,
  onEditProject,
  onMoveChat,
}: {
  chats: Chat[];
  curId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onExport: (id: string) => void;
  onExportJson: (id: string) => void;
  onShare: (chat: Chat) => void;
  onTags: (chat: Chat) => void;
  onChatSettings: (chat: Chat) => void;
  onDuplicate: (chat: Chat) => void;
  onGlobalSearch: () => void;
  streamingChatId?: string | null;
  onClose?: () => void;
  projects?: Project[];
  curProjectId?: string | null;
  onPickProject?: (id: string | null) => void;
  onNewProject?: () => void;
  onEditProject?: (id: string) => void;
  onMoveChat?: (chatId: string, projectId: string | null) => void;
}) {
  const curProject = projects.find((p) => p.id === curProjectId) || null;
  const projectById = React.useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  // live chat counts from the loaded chat list (server counts can be stale right after creating a chat)
  const chatCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of chats) if (c.projectId) m.set(c.projectId, (m.get(c.projectId) || 0) + 1);
    return m;
  }, [chats]);
  const [q, setQ] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);

  // collect all tags across chats
  const allTags = React.useMemo(() => {
    const s = new Set<string>();
    for (const c of chats) for (const t of c.tags || []) s.add(t);
    return Array.from(s).sort();
  }, [chats]);

  const filtered = React.useMemo(() => {
    const k = q.trim().toLowerCase();
    let list = curProjectId ? chats.filter((c) => c.projectId === curProjectId) : chats;
    if (tagFilter) list = list.filter((c) => (c.tags || []).includes(tagFilter));
    if (k) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(k) ||
          c.msgs.some((m) => (m.content || "").toLowerCase().includes(k)) ||
          (c.searchText || "").includes(k)
      );
    }
    return list;
  }, [chats, q, tagFilter, curProjectId]);

  // pinned first (Pinned section), then grouped by date for the rest
  const pinned = React.useMemo(() => filtered.filter((c) => c.pinned), [filtered]);
  const rest = React.useMemo(() => filtered.filter((c) => !c.pinned), [filtered]);

  const groups = React.useMemo(() => {
    const m = new Map<string, Chat[]>();
    for (const c of rest) {
      const g = grpName(c.at);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(c);
    }
    return Array.from(m.entries());
  }, [rest]);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* top */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="grid size-7 place-items-center rounded-md bg-arpa text-sm font-extrabold text-arpa-foreground">A</div>
        <span className="flex-1 text-base font-semibold tracking-wide">ARPA</span>
        {onClose && (
          <Button size="icon" variant="ghost" className="size-8 md:hidden" onClick={onClose}>
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* new chat */}
      <div className="px-2.5 pb-1">
        <Button onClick={onNew} variant="secondary" className="w-full justify-start gap-2.5 rounded-lg font-medium">
          <Plus className="size-4" /> New chat
        </Button>
      </div>

      {/* search */}
      <div className="flex gap-1.5 px-2.5 py-1">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter chats"
            className="h-8 rounded-lg border-transparent bg-transparent pl-8 text-sm focus-visible:border-border"
          />
        </div>
        <Button
          size="icon"
          variant="outline"
          className="size-8 shrink-0 border-transparent hover:bg-muted"
          onClick={onGlobalSearch}
          title="Search across all chats"
        >
          <Globe className="size-3.5 text-arpa" />
        </Button>
      </div>

      {/* projects */}
      {onPickProject && (
        <div className="px-2.5 pb-1 pt-1.5">
          {curProject ? (
            <div className="rounded-lg border border-arpa/30 bg-arpa/5 px-2 py-1.5">
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="size-6" onClick={() => onPickProject(null)} aria-label="Back to all chats">
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-base leading-none">{curProject.emoji}</span>
                <span className="flex-1 truncate text-sm font-semibold" title={curProject.name}>{curProject.name}</span>
                <Button size="icon" variant="ghost" className="size-6 text-muted-foreground" onClick={() => onEditProject?.(curProject.id)} aria-label="Project settings">
                  <Settings2 className="size-3.5" />
                </Button>
              </div>
              <p className="px-1 pt-0.5 text-[11px] text-muted-foreground">
                {chatCounts.get(curProject.id) || 0} chat{(chatCounts.get(curProject.id) || 0) !== 1 ? "s" : ""} · {curProject.fileCount} file{curProject.fileCount !== 1 ? "s" : ""}
                {curProject.instructions ? " · instructions set" : ""}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-1 py-0.5">
                <p className="text-xs font-semibold text-muted-foreground">Projects</p>
                <Button size="icon" variant="ghost" className="size-6 text-muted-foreground" onClick={onNewProject} aria-label="New project" title="New project">
                  <FolderPlus className="size-3.5" />
                </Button>
              </div>
              {projects.length === 0 ? (
                <button onClick={onNewProject} className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-sidebar-accent">
                  + Create a project to group chats with shared instructions & files
                </button>
              ) : (
                <div className="max-h-40 overflow-y-auto">
                  {projects.map((p) => (
                    <div key={p.id} className="group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm hover:bg-sidebar-accent">
                      <button onClick={() => onPickProject(p.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={p.name}>
                        <span className="text-sm leading-none">{p.emoji}</span>
                        <span className="truncate">{p.name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{chatCounts.get(p.id) || 0}</span>
                      </button>
                      <Button size="icon" variant="ghost" className="size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" onClick={() => onEditProject?.(p.id)} aria-label={`${p.name} settings`}>
                        <Settings2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2.5 pb-1.5">
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              className="inline-flex items-center gap-1 rounded-full bg-arpa px-2 py-0.5 text-[11px] font-medium text-arpa-foreground"
            >
              <Filter className="size-2.5" /> {tagFilter} <X className="size-2.5" />
            </button>
          )}
          {!tagFilter && allTags.slice(0, 6).map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(t)}
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* list */}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-2.5 pb-2 pt-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            {q ? "No results found" : curProject ? "No chats in this project yet. Start a new chat — it will use the project's instructions and files." : "No chats yet. Ask a new question to get started."}
          </p>
        ) : (
          <>
            {/* pinned */}
            {pinned.length > 0 && (
              <div className="mb-1">
                <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-arpa">
                  <Pin className="size-3" /> Pinned
                </p>
                {pinned.map((c) => (
                  <ChatRow
                    key={c.id}
                    c={c}
                    curId={curId}
                    onPick={onPick}
                    onPin={onPin}
                    onRename={onRename}
                    onDelete={onDelete}
                    onExport={onExport}
                    onExportJson={onExportJson}
                    onShare={onShare}
                    onTags={onTags}
                    onChatSettings={onChatSettings}
                    onDuplicate={onDuplicate}
                    projects={projects}
                    project={c.projectId ? projectById.get(c.projectId) : undefined}
                    showProject={!curProjectId}
                    onMoveChat={onMoveChat}
                    isStreaming={c.id === streamingChatId}
                  />
                ))}
              </div>
            )}
            {/* by date */}
            {groups.map(([g, items]) => (
              <div key={g} className="mb-1">
                <p className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">{g}</p>
                {items.map((c) => (
                  <ChatRow
                    key={c.id}
                    c={c}
                    curId={curId}
                    onPick={onPick}
                    onPin={onPin}
                    onRename={onRename}
                    onDelete={onDelete}
                    onExport={onExport}
                    onExportJson={onExportJson}
                    onShare={onShare}
                    onTags={onTags}
                    onChatSettings={onChatSettings}
                    onDuplicate={onDuplicate}
                    projects={projects}
                    project={c.projectId ? projectById.get(c.projectId) : undefined}
                    showProject={!curProjectId}
                    onMoveChat={onMoveChat}
                    isStreaming={c.id === streamingChatId}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {/* footer hint */}
      <div className="border-t border-sidebar-border px-3 py-2 text-[11px] text-muted-foreground">
        {curProject ? `${filtered.length} in project` : `${chats.length} chat${chats.length !== 1 ? "s" : ""}`} · synced
        {pinned.length > 0 && ` · ${pinned.length} pinned`}
      </div>
    </div>
  );
}

function ChatRow({
  c,
  curId,
  onPick,
  onPin,
  onRename,
  onDelete,
  onExport,
  onExportJson,
  onShare,
  onTags,
  onChatSettings,
  onDuplicate,
  isStreaming,
  projects = [],
  project,
  showProject,
  onMoveChat,
}: {
  c: Chat;
  curId: string | null;
  onPick: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onExportJson: (id: string) => void;
  onShare: (chat: Chat) => void;
  onTags: (chat: Chat) => void;
  onChatSettings: (chat: Chat) => void;
  onDuplicate: (chat: Chat) => void;
  isStreaming?: boolean;
  projects?: Project[];
  project?: Project;
  showProject?: boolean;
  onMoveChat?: (chatId: string, projectId: string | null) => void;
}) {
  const tags = (c.tags || []).slice(0, 2);
  const extraTags = (c.tags || []).length - tags.length;
  return (
    <div
      className={`group flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-sidebar-accent ${
        c.id === curId ? "bg-sidebar-accent font-medium" : ""
      }`}
    >
      <button
        onClick={() => onPick(c.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={c.title}
      >
        {isStreaming ? (
          <span className="flex shrink-0 items-center gap-0.5">
            <span className="size-1.5 rounded-full bg-arpa" style={{ animation: "arpa-blink 1.2s 0s infinite" }} />
            <span className="size-1.5 rounded-full bg-arpa" style={{ animation: "arpa-blink 1.2s 0.2s infinite" }} />
            <span className="size-1.5 rounded-full bg-arpa" style={{ animation: "arpa-blink 1.2s 0.4s infinite" }} />
          </span>
        ) : c.pinned ? <Pin className="size-3 shrink-0 text-arpa" /> : <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className="truncate">{c.title}</span>
        {showProject && project && <span className="shrink-0 text-[11px] leading-none" title={`Project: ${project.name}`}>{project.emoji}</span>}
        {c.systemPrompt && <Bot className="size-3 shrink-0 text-arpa" />}
        {c.shared && <Share2 className="size-3 shrink-0 text-cyan-500" />}
      </button>
      {(tags.length > 0 || c.shared) && (
        <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
          {tags.map((t) => (
            <span key={t} className="rounded bg-muted px-1 py-0 text-[9px] text-muted-foreground">#{t}</span>
          ))}
          {extraTags > 0 && <span className="text-[9px] text-muted-foreground">+{extraTags}</span>}
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => onPin(c.id, !c.pinned)}>
            {c.pinned ? <PinOff className="mr-2 size-3.5" /> : <Pin className="mr-2 size-3.5" />}
            {c.pinned ? "Unpin" : "Pin chat"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onTags(c)}>
            <TagIcon className="mr-2 size-3.5" /> Tags
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onChatSettings(c)}>
            <Bot className="mr-2 size-3.5" /> Persona & settings{c.systemPrompt ? " ✓" : ""}
          </DropdownMenuItem>
          {onMoveChat && (projects.length > 0 || c.projectId) && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="mr-2 size-3.5" /> Move to project
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {projects.filter((p) => p.id !== c.projectId).map((p) => (
                  <DropdownMenuItem key={p.id} onSelect={() => onMoveChat(c.id, p.id)}>
                    <span className="mr-2">{p.emoji}</span> <span className="truncate">{p.name}</span>
                  </DropdownMenuItem>
                ))}
                {c.projectId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onMoveChat(c.id, null)}>
                      <FolderMinus className="mr-2 size-3.5" /> Remove from project
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuItem onSelect={() => onShare(c)}>
            <Share2 className="mr-2 size-3.5" /> {c.shared ? "Manage share link" : "Share chat"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicate(c)}>
            <Copy className="mr-2 size-3.5" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport(c.id)}>
            <Download className="mr-2 size-3.5" /> Export (.md)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExportJson(c.id)}>
            <FileJson className="mr-2 size-3.5" /> Export (.json)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {
            const t = prompt("Chat name", c.title);
            if (t && t.trim()) onRename(c.id, t.trim().slice(0, 80));
          }}>
            <Pencil className="mr-2 size-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              if (confirm(`Delete "${c.title}"?`)) onDelete(c.id);
            }}
          >
            <Trash2 className="mr-2 size-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// helpers
export async function deleteChat(id: string, cb?: () => void) {
  const { status, data } = await api<{ ok: boolean; error?: string }>(`/api/chats/${id}`, { method: "DELETE" });
  if (status !== 200 || !data?.ok) {
    toast.error(data?.error || "Delete failed");
    return;
  }
  cb?.();
  toast.success("Chat deleted");
}

export async function renameChat(id: string, title: string, cb?: () => void) {
  const { status, data } = await api<{ ok: boolean; title?: string }>(`/api/chats/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
  if (status !== 200 || !data?.ok) {
    toast.error("Rename failed");
    return;
  }
  cb?.();
}

export async function pinChat(id: string, pinned: boolean, cb?: () => void) {
  const { status, data } = await api<{ ok: boolean; pinned?: boolean }>(`/api/chats/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ pinned }),
  });
  if (status !== 200 || !data?.ok) {
    toast.error("Pin failed");
    return;
  }
  cb?.();
  toast.success(pinned ? "Chat pinned" : "Chat unpinned");
}
