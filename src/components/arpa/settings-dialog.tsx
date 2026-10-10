"use client";
// ARPA V3.1 — Settings dialog: temperature, TTS voice, TTS speed.
import * as React from "react";
import { toast } from "sonner";
import { Settings2, Save, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TTS_VOICES, settingsStore, type ArpaSettings } from "@/lib/arpa-client";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [s, setS] = React.useState<ArpaSettings>(settingsStore.get());

  React.useEffect(() => { if (open) setS(settingsStore.get()); }, [open]);

  const save = () => {
    settingsStore.set(s);
    toast.success("Settings saved");
    onOpenChange(false);
  };

  const reset = () => {
    const def: ArpaSettings = { temperature: 0.3, voice: "tongtong", ttsSpeed: 1 };
    setS(def);
    settingsStore.set(def);
    toast.info("Default settings restored");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-5 text-arpa" /> Settings
          </DialogTitle>
          <DialogDescription>Customize AI answers and voice controls.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Temperature */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-medium">Creativity (temperature)</Label>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono">{s.temperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[s.temperature]}
              min={0}
              max={1.5}
              step={0.05}
              onValueChange={(v) => setS((p) => ({ ...p, temperature: v[0] }))}
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>Precise (0)</span>
              <span>Balanced (0.3)</span>
              <span>Creative (1.5)</span>
            </div>
          </div>

          {/* TTS voice */}
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Read-aloud voice</Label>
            <Select value={s.voice} onValueChange={(v) => setS((p) => ({ ...p, voice: v }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a voice" />
              </SelectTrigger>
              <SelectContent>
                {TTS_VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    <div className="flex flex-col">
                      <span className="text-sm">{v.label}</span>
                      <span className="text-xs text-muted-foreground">{v.desc}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* TTS speed */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-medium">Voice speed</Label>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono">{s.ttsSpeed.toFixed(1)}x</span>
            </div>
            <Slider
              value={[s.ttsSpeed]}
              min={0.5}
              max={2}
              step={0.1}
              onValueChange={(v) => setS((p) => ({ ...p, ttsSpeed: v[0] }))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={reset} className="mr-auto">
            <RotateCcw className="mr-1.5 size-3.5" /> Default
          </Button>
          <Button onClick={save} className="bg-arpa text-arpa-foreground hover:opacity-90">
            <Save className="mr-1.5 size-4" /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
