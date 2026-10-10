"use client";
// ARPA V3 — Legal (Terms / Privacy / Refund / Contact) modal.
// Replaces V2's /legal.html (kept inside the single / route per project rules).
import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function LegalModal({
  open,
  onOpenChange,
  initial = "terms",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: "terms" | "privacy" | "refund" | "contact";
}) {
  const [tab, setTab] = React.useState<"terms" | "privacy" | "refund" | "contact">(initial);
  React.useEffect(() => { if (open) setTab(initial); }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>ARPA — Policies</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-border px-4">
            <TabsList className="bg-transparent">
              <TabsTrigger value="terms">Terms</TabsTrigger>
              <TabsTrigger value="privacy">Privacy</TabsTrigger>
              <TabsTrigger value="refund">Refund</TabsTrigger>
              <TabsTrigger value="contact">Contact</TabsTrigger>
            </TabsList>
          </div>
          <ScrollArea className="h-[60vh] px-6 py-5 text-sm leading-relaxed">
            <TabsContent value="terms" className="mt-0 space-y-2">
              <h3 className="text-base font-semibold">Terms of Service</h3>
              <ol className="list-decimal space-y-2 pl-5">
                <li>ARPA is an AI chat service operated by us. By using the service you agree to these terms.</li>
                <li><b>Account:</b> Login is by email. One person can take only one free trial.</li>
                <li><b>Free trial:</b> New accounts get a 90-day free trial with a daily message limit. To keep chatting after the trial, you must buy a paid plan.</li>
                <li><b>Paid plans:</b> A plan is a one-time payment (no auto-renew). The plan period starts after payment (or after the trial ends). A daily message limit applies for fair use.</li>
                <li><b>AI answers:</b> AI answers may be wrong or incomplete. Do not treat them as professional (legal, tax, medical, financial) advice — please confirm with an expert before important decisions.</li>
                <li><b>Prohibited:</b> Using the service for illegal, harmful, spam, or rights-violating activities; hacking, overloading, or reselling the service. Doing so may result in account suspension.</li>
                <li>We may change, interrupt, or discontinue the service at any time. Our liability is limited to the amount you paid us in the past 3 months.</li>
                <li>These terms are governed by the laws of India.</li>
              </ol>
            </TabsContent>
            <TabsContent value="privacy" className="mt-0 space-y-2">
              <h3 className="text-base font-semibold">Privacy Policy</h3>
              <ul className="list-disc space-y-2 pl-5">
                <li><b>What we collect:</b> Name, email; your chats (so history appears on every device); usage count; payment details.</li>
                <li><b>Where it is stored:</b> In a cloud database. Chat messages are sent to the AI model provider to generate responses.</li>
                <li><b>Why:</b> To run the service, manage login, billing, prevent misuse, and provide support. We do not sell your data.</li>
                <li><b>Your rights:</b> You can remove chats from within the app via "Delete all chats". To fully delete your account and data, write to support.</li>
                <li>Please do not enter passwords, bank details, or highly sensitive information in chats.</li>
              </ul>
            </TabsContent>
            <TabsContent value="refund" className="mt-0 space-y-2">
              <h3 className="text-base font-semibold">Refund & Cancellation</h3>
              <ul className="list-disc space-y-2 pl-5">
                <li>Plans do not auto-renew, so there is no need to cancel — the plan simply ends when its period is over.</li>
                <li>Within 7 days of payment, if the plan was barely used, send a refund request to support (include the Payment ID).</li>
                <li>Approved refunds are returned to the original payment method in 5–7 working days.</li>
                <li>If you were charged twice by mistake, the second payment will be fully refunded.</li>
              </ul>
            </TabsContent>
            <TabsContent value="contact" className="mt-0 space-y-1.5">
              <h3 className="text-base font-semibold">Contact Us</h3>
              <p><b>ARPA</b><br/>Email: support@arpa.ai<br/>Demo project — simulated service.</p>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
