"use client";
// ARPA — create / edit a Project: name, emoji, instructions and knowledge files.
// Files are read in the browser (same reader as chat attachments) and only their text is stored.
import * as React from "react";
import { toast } from "sonner";
import { FolderPlus, FileText, Loader2, Trash2, Upload, Save, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type ProjectDetail, type ProjectFileMeta } from "@/lib/arpa-client";
import { extractFile, fmtSize } from "@/lib/file-extract";

const EMOJIS = ["📁", "💼", "📊", "🏦", "⚡", "🌱", "🏭", "🏨", "🎓", "⚖️", "🧾", "💡"];
const EXAMPLES = [
  "You are the finance analyst for this project. Use the knowledge files for figures and always show calculations.",
  "You are a GST compliance assistant. Answer with section references and a short checklist.",
  "You help draft bank loan proposals. Keep a formal tone and follow the format of the uploaded samples.",
];

export function ProjectDialog({
  open,
  onOpenChange,
  projectId,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string | null; // null = create
  onSaved: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [emoji, setEmoji] = React.useState("📁");
  const [instructions, setInstructions] = React.useState("");
  const [files, setFiles] = React.useState<ProjectFileMeta[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const isEdit = !!projectId;

  React.useEffect(() => {
    if (!open) return;
    if (!projectId) { setName(""); setEmoji("📁"); setInstructions(""); setFiles([]); return; }
    setLoading(true);
    api<{ ok: boolean; project?: ProjectDetail; error?: string }>(`/api/projects/${projectId}`)
      .then(({ status, data }) => {
        if (status === 200 && data?.project) {
          setName(data.project.name); setEmoji(data.project.emoji || "📁");
          setInstructions(data.project.instructions); setFiles(data.project.files);
        } else toast.error(data?.error || "Could not load project");
      })
      .finally(() => setLoading(false));
  }, [open, projectId]);

  const save = async () => {
    if (!name.trim()) { toast.error("Please give the project a name"); return; }
    setSaving(true);
    try {
      const body = JSON.stringify({ name: name.trim(), emoji, instructions });
      const { status, data } = isEdit
        ? await api<{ ok: boolean; error?: string }>(`/api/projects/${projectId}`, { method: "PATCH", body })
        : await api<{ ok: boolean; id?: string; error?: string }>("/api/projects", { method: "POST", body });
      if (status !== 200 || !data?.ok) { toast.error(data?.error || "Could not save project"); return; }
      const id = isEdit ? projectId! : (data as { id?: string }).id!;
      toast.success(isEdit ? "Project updated" : "Project created");
      onSaved(id);
      if (!isEdit) onOpenChange(false);
    } finally { setSaving(false); }
  };

  const upload = async (list: File[]) => {
    if (!projectId || !list.length) return;
    setUploading(true);
    try {
      for (const f of list) {
        try {
          const r = await extractFile(f);
          if (r.kind !== "file") { toast.error(`${f.name}: only text documents can be project knowledge (scanned PDFs / images are not supported here).`); continue; }
          const { status, data } = await api<{ ok: boolean; file?: ProjectFileMeta & { truncated?: boolean }; error?: string }>(
            `/api/projects/${projectId}/files`,
            { method: "POST", body: JSON.stringify({ name: r.file.name, size: r.file.size, text: r.file.text }) },
          );
          if (status === 200 && data?.file) {
            setFiles((x) => [...x, data.file!]);
            toast.success(`${f.name} added${data.file.truncated || r.file.truncated ? " (large file — partly stored)" : ""}`);
          } else toast.error(`${f.name}: ${data?.error || "upload failed"}`);
        } catch (e: any) { toast.error(`${f.name}: ${e?.message || "could not read file"}`); }
      }
      onSaved(projectId);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeFile = async (fid: string) => {
    const { status } = await api(`/api/projects/${projectId}/files/${fid}`, { method: "DELETE" });
    if (status === 200) { setFiles((x) => x.filter((f) => f.id !== fid)); onSaved(projectId!); }
    else toast.error("Could not delete file");
  };

  const removeProject = async () => {
    if (!projectId || !confirm("Delete this project and its files? Chats will be kept (moved out of the project).")) return;
    const { status } = await api(`/api/projects/${projectId}`, { method: "DELETE" });
    if (status === 200) { toast.success("Project deleted"); onDeleted(projectId); onOpenChange(false); }
    else toast.error("Could not delete project");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="size-5 text-arpa" /> {isEdit ? "Project settings" : "New project"}
          </DialogTitle>
          <DialogDescription>
            Chats in a project share its instructions and knowledge files — ARPA uses them in every reply.
            Large files are searched automatically: ARPA picks the relevant parts and cites them as [F1], [F2].
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="pname" className="mb-1.5 block">Name</Label>
              <div className="flex gap-2">
                <select
                  aria-label="Project icon"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-2 text-lg"
                >
                  {EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
                <Input id="pname" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. DIPPL Term Loan" />
              </div>
            </div>

            <div>
              <Label htmlFor="pinstr" className="mb-1.5 block">Instructions <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="pinstr" rows={5} maxLength={8000} value={instructions} onChange={(e) => setInstructions(e.target.value)}
                placeholder="How should ARPA behave in this project?" />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex, i) => (
                  <button key={i} type="button" onClick={() => setInstructions(ex)}
                    className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-arpa hover:text-foreground">
                    Example {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><BookOpen className="size-4" /> Knowledge files</Label>
                {isEdit && (
                  <Button size="sm" variant="outline" className="h-7 gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Add files
                  </Button>
                )}
              </div>
              <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.docx,.xlsx,.xls,.csv,.pptx,.txt,.md,.json"
                onChange={(e) => upload(Array.from(e.target.files || []))} />
              {!isEdit ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Create the project first, then add PDFs, Word, Excel or text files.</p>
              ) : files.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No files yet. Add documents ARPA should refer to (DPRs, statements, policies, samples…).</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2.5 px-3 py-2">
                      <FileText className="size-4 shrink-0 text-arpa" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{f.name}</p>
                        <p className="text-[11px] text-muted-foreground">{fmtSize(f.size)} · {f.chars.toLocaleString("en-IN")} characters</p>
                      </div>
                      <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => removeFile(f.id)} aria-label={`Delete ${f.name}`}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={removeProject}>
              <Trash2 className="mr-1.5 size-4" /> Delete project
            </Button>
          ) : <span />}
          <Button onClick={save} disabled={saving || loading} className="bg-arpa text-arpa-foreground hover:opacity-90">
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
            {isEdit ? "Save" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
