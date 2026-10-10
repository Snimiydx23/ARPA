"use client";
// ARPA V3.2 — Image attach button for the composer.
// Opens a file picker, reads the image as data-URL, calls /api/vision, and
// inserts the AI's description into the composer textarea (as a user turn).
import * as React from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/arpa-client";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB

export function ImageAttach({
  onInsert,
  disabled,
}: {
  onInsert: (text: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<string>("");
  const [prompt, setPrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const reset = () => { setPreview(""); setPrompt(""); setLoading(false); };

  const onFile = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Only image files are allowed"); return; }
    if (f.size > MAX_BYTES) { toast.error("Image must be smaller than 4MB"); return; }
    const fr = new FileReader();
    fr.onloadend = () => { setPreview(String(fr.result || "")); setOpen(true); };
    fr.readAsDataURL(f);
  };

  const analyze = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const { status, data } = await api<{ ok: boolean; text?: string; error?: string }>(
        "/api/vision",
        { method: "POST", body: JSON.stringify({ image: preview, prompt: prompt || undefined }) }
      );
      if (status !== 200 || !data?.ok) {
        toast.error(data?.error || "Image could not be analyzed");
        return;
      }
      // build a user turn that includes the AI's description + asks follow-up
      const turn = `**Image analysis:**\n\n${data.text}\n\n---\n\nWant to ask more about this?`;
      onInsert(turn);
      setOpen(false);
      reset();
      toast.success("Image analyzed ✓");
    } catch (e: any) {
      toast.error(e?.message || "Vision error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
      <Button
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        size="icon"
        variant="ghost"
        className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        title="Analyze image (VLM)"
      >
        <ImagePlus className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImagePlus className="size-5 text-arpa" /> Analyze image
            </DialogTitle>
            <DialogDescription>
              ARPA will look at the image and describe it (OCR, objects, scene). The result will be added to the composer.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="relative overflow-hidden rounded-xl border border-border">
              { }
              <img src={preview} alt="preview" className="max-h-64 w-full object-contain bg-muted/30" />
              <Button
                size="icon"
                variant="secondary"
                className="absolute right-2 top-2 size-7"
                onClick={() => setPreview("")}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Custom prompt <span className="text-muted-foreground">(optional)</span></label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. What is the text in this image? / What objects are present?"
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-arpa"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={analyze} disabled={loading || !preview} className="bg-arpa text-arpa-foreground hover:opacity-90">
              {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ImagePlus className="mr-1.5 size-4" />}
              {loading ? "Analyzing…" : "Analyze & add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
