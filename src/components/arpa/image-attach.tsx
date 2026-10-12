"use client";
// ARPA — Image attach button for the composer.
// Picks an image, compresses it in the browser, and hands it to the composer so it is
// sent DIRECTLY with the next chat message (multimodal model on the server).
//   image = full-size (max 1280px JPEG) — sent to the AI for this turn
//   thumb = small (max 320px JPEG)      — saved with the chat history + shown in bubbles
import * as React from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PickedImage = {
  image: string;   // full-size data-URL (sent to AI)
  thumb: string;   // small data-URL (saved + shown)
  more?: string[]; // extra page images (scanned PDF pages 2..n)
  name?: string;   // original file name (scanned PDF)
  pages?: number;
};

const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15MB raw file (compressed before upload)

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not read this image"));
    img.src = src;
  });
}

function toJpeg(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; // flatten transparent PNGs
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", quality);
}

/** Read + compress an image file into { image, thumb } data-URLs. */
export async function prepareImage(f: File): Promise<PickedImage> {
  if (!f.type.startsWith("image/")) throw new Error("Only image files are allowed");
  if (f.size > MAX_INPUT_BYTES) throw new Error("Image must be smaller than 15MB");
  const url = URL.createObjectURL(f);
  try {
    const img = await loadImg(url);
    return { image: toJpeg(img, 1280, 0.85), thumb: toJpeg(img, 320, 0.7) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Attach button — opens the file picker for ANY supported file (images, PDF, Word, Excel, PPT, text, code).
// The composer decides how to read each file (see src/lib/file-extract.ts).
export function ImageAttach({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(files);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />
      <Button
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        size="icon"
        variant="ghost"
        className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        title="Attach image or file (or drag & drop)"
      >
        <Paperclip className="size-4" />
      </Button>
    </>
  );
}
