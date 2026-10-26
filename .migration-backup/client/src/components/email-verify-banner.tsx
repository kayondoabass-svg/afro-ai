import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UserShape {
  email?: string | null;
  emailVerified?: string | null;
}

export function EmailVerifyBanner() {
  const { data: user } = useQuery<UserShape>({ queryKey: ["/api/auth/user"] });
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  if (!user || !user.email || user.emailVerified || dismissed) return null;

  async function resend() {
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/auth/send-verification", {});
      const data = await res.json().catch(() => ({}));
      if (data.alreadyVerified) {
        toast({ title: "Already verified", description: "Your email is already confirmed." });
        setDismissed(true);
      } else {
        toast({ title: "Verification email sent", description: `Check ${user!.email} for the link.` });
      }
    } catch (e: any) {
      toast({ title: "Couldn't send", description: e?.message || "Try again in a moment.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center gap-3" data-testid="banner-verify-email">
      <Mail className="w-5 h-5 text-amber-500 shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-medium">Confirm your email.</span>{" "}
        <span className="text-muted-foreground">We sent a link to <span className="font-mono">{user.email}</span>. Confirm it to keep your account secure.</span>
      </div>
      <Button size="sm" variant="outline" onClick={resend} disabled={sending} data-testid="button-resend-verify">
        {sending ? "Sending…" : "Resend"}
      </Button>
      <Button size="sm" variant="ghost" className="px-2" onClick={() => setDismissed(true)} data-testid="button-dismiss-verify" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
