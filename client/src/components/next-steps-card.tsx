import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Globe, Mail, ShieldCheck, MessageCircle, Smartphone, Phone,
  ArrowRight, Sparkles, Check,
} from "lucide-react";

export interface NextStepsCardProps {
  appId?: number;
  publishedUrl: string;
  appCode?: string | null;
  onClose?: () => void;
}

interface UpsellItem {
  key: string;
  icon: any;
  title: string;
  pitch: string;
  href: string;
  color: string;
  detect?: (code: string) => boolean;
}

const ITEMS: UpsellItem[] = [
  {
    key: "domain",
    icon: Globe,
    title: "Custom domain",
    pitch: "Replace .afroaigroup.com with mybusiness.com — SSL included.",
    href: "/deployments",
    color: "text-blue-500 bg-blue-500/10 border-blue-500/30",
  },
  {
    key: "email",
    icon: Mail,
    title: "Send emails",
    pitch: "Drop-in API for receipts, password resets and notifications.",
    href: "/email-api",
    color: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    detect: (c) => /sendmail|nodemailer|email|mailto:|@.*\.com/i.test(c),
  },
  {
    key: "auth",
    icon: ShieldCheck,
    title: "Add login",
    pitch: "Multi-tenant Afro Auth — Google, GitHub, email/password in 1 line.",
    href: "/dashboard/auth",
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
    detect: (c) => /login|signup|sign-in|register|account|profile|user/i.test(c),
  },
  {
    key: "chatbot",
    icon: MessageCircle,
    title: "Chatbot widget",
    pitch: "Add an AI assistant trained on your site — one script tag.",
    href: "/chatbot-api",
    color: "text-purple-500 bg-purple-500/10 border-purple-500/30",
    detect: (c) => /support|help|contact|faq|question/i.test(c),
  },
  {
    key: "sms",
    icon: Smartphone,
    title: "Send SMS",
    pitch: "Reach customers across Africa via Africa's Talking, Twilio.",
    href: "/integrations",
    color: "text-rose-500 bg-rose-500/10 border-rose-500/30",
    detect: (c) => /sms|otp|verification.code|phone.number|\+?2[1-9]\d{8,}/i.test(c),
  },
  {
    key: "ussd",
    icon: Phone,
    title: "USSD app",
    pitch: "Take your service offline — works on any phone, no internet.",
    href: "/ussd",
    color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30",
  },
];

export function NextStepsCard({ appId, publishedUrl, appCode, onClose }: NextStepsCardProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const code = (appCode || "").toLowerCase();
  const ranked = [...ITEMS].sort((a, b) => {
    const aRel = a.detect ? (a.detect(code) ? 1 : 0) : 0.5;
    const bRel = b.detect ? (b.detect(code) ? 1 : 0) : 0.5;
    return bRel - aRel;
  });
  const visible = ranked.filter((i) => !dismissed.has(i.key));
  if (!visible.length) return null;
  return (
    <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3" data-testid="next-steps-card">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Recommended next steps for your app</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Make <span className="font-mono text-primary">{publishedUrl.replace(/^https?:\/\//, "")}</span> even more powerful with these Afro AI add-ons.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {visible.map((item) => {
          const Icon = item.icon;
          const recommended = item.detect ? item.detect(code) : false;
          const url = appId ? `${item.href}?app=${appId}` : item.href;
          return (
            <div key={item.key} className={`relative rounded-md border p-3 flex items-start gap-2.5 ${item.color}`} data-testid={`next-step-${item.key}`}>
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-foreground">{item.title}</p>
                  {recommended && <Badge variant="default" className="text-[9px] h-4 px-1">Recommended</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{item.pitch}</p>
                <Link href={url}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] mt-1.5 -ml-2"
                    onClick={() => onClose?.()}
                    data-testid={`button-add-${item.key}`}
                  >
                    Add to app <ArrowRight className="w-3 h-3 ml-0.5" />
                  </Button>
                </Link>
              </div>
              <button
                onClick={() => setDismissed(new Set([...Array.from(dismissed), item.key]))}
                className="absolute top-1 right-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground"
                data-testid={`button-dismiss-${item.key}`}
                aria-label="Dismiss"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
