// ARPA V3 — client state (Zustand). Replaces V2's global `S` object.
import { create } from "zustand";
import type { AppConfig, ArpaUser, Chat, ChatMsg, Model, SubStatus } from "@/lib/arpa-client";

type ArpaState = {
  config: AppConfig | null;
  user: ArpaUser | null;
  sub: SubStatus | null;
  usedToday: number;
  chats: Chat[];
  curId: string | null;
  model: string;
  busy: boolean;
  ctrl: AbortController | null;
  booting: boolean;
  authError: string;

  // setters
  setConfig: (c: AppConfig) => void;
  setSession: (data: { user: ArpaUser; sub: SubStatus; usedToday: number }) => void;
  setSub: (s: SubStatus) => void;
  setChats: (c: Chat[]) => void;
  setCurId: (id: string | null) => void;
  setModel: (m: string) => void;
  setBusy: (b: boolean, ctrl?: AbortController | null) => void;
  setBooting: (b: boolean) => void;
  setAuthError: (e: string) => void;
  curChat: () => Chat | null;
  upsertChat: (c: Chat) => void;
  patchChat: (id: string, patch: Partial<Chat>) => void;
  removeChat: (id: string) => void;
};

export const useArpa = create<ArpaState>((set, get) => ({
  config: null,
  user: null,
  sub: null,
  usedToday: 0,
  chats: [],
  curId: null,
  model: "",
  busy: false,
  ctrl: null,
  booting: true,
  authError: "",

  setConfig: (c) => set({ config: c }),
  setSession: (data) =>
    set({ user: data.user, sub: data.sub, usedToday: data.usedToday, booting: false, authError: "" }),
  setSub: (s) => set({ sub: s }),
  setChats: (chats) => set({ chats }),
  setCurId: (id) => set({ curId: id }),
  setModel: (m) => set({ model: m }),
  setBusy: (b, ctrl = null) => set({ busy: b, ctrl }),
  setBooting: (b) => set({ booting: b }),
  setAuthError: (e) => set({ authError: e, booting: false }),

  curChat: () => {
    const { chats, curId } = get();
    return chats.find((c) => c.id === curId) || null;
  },
  upsertChat: (c) =>
    set((s) => {
      const i = s.chats.findIndex((x) => x.id === c.id);
      const next = [...s.chats];
      if (i >= 0) next[i] = c;
      else next.unshift(c);
      // keep newest first
      next.sort((a, b) => b.at - a.at);
      return { chats: next };
    }),
  patchChat: (id, patch) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  removeChat: (id) =>
    set((s) => ({
      chats: s.chats.filter((c) => c.id !== id),
      curId: s.curId === id ? null : s.curId,
    })),
}));

// selectors (kept simple, components can also useStore directly)
export const selectCurChat = (s: ArpaState) => s.chats.find((c) => c.id === s.curId) || null;
