import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Mail, ArrowRight, Copy, Check, ExternalLink, ChevronRight,
  Globe, Key, Send, ShieldCheck, AlertCircle, BookOpen,
} from "lucide-react";

const STEPS = [
  { id: 1, title: "Create your Afro AI account", icon: Mail },
  { id: 2, title: "Open the Email API", icon: BookOpen },
  { id: 3, title: "Add your domain", icon: Globe },
  { id: 4, title: "Add the DNS records", icon: ShieldCheck },
  { id: 5, title: "Wait for verification", icon: Check },
  { id: 6, title: "Create an API key", icon: Key },
  { id: 7, title: "Send your first email", icon: Send },
];

const CODE_NODE = `await fetch("https://afroaigroup.com/api/email-api/send", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sk_live_YOUR_KEY_HERE",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    from: "Hello <hello@mywebsite.com>",
    to: "customer@example.com",
    subject: "Welcome to MyWebsite!",
    html: "<h1>Hello!</h1><p>Thanks for signing up.</p>"
  })
});`;

const CODE_PYTHON = `import requests

requests.post("https://afroaigroup.com/api/email-api/send",
  headers={"Authorization": "Bearer sk_live_YOUR_KEY_HERE"},
  json={
    "from": "Hello <hello@mywebsite.com>",
    "to": "customer@example.com",
    "subject": "Welcome to MyWebsite!",
    "html": "<h1>Hello!</h1><p>Thanks for signing up.</p>"
  })`;

const CODE_PHP = `<?php
$ch = curl_init("https://afroaigroup.com/api/email-api/send");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer sk_live_YOUR_KEY_HERE",
    "Content-Type: application/json"
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "from" => "Hello <hello@mywebsite.com>",
    "to"   => "customer@example.com",
    "subject" => "Welcome to MyWebsite!",
    "html" => "<h1>Hello!</h1><p>Thanks for signing up.</p>"
  ]),
  CURLOPT_RETURNTRANSFER => true
]);
echo curl_exec($ch);`;

const CODE_CURL = `curl -X POST https://afroaigroup.com/api/email-api/send \\
  -H "Authorization: Bearer sk_live_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "Hello <hello@mywebsite.com>",
    "to": "customer@example.com",
    "subject": "Welcome to MyWebsite!",
    "html": "<h1>Hello!</h1>"
  }'`;

const TABS = [
  { id: "node", label: "Node.js", code: CODE_NODE, lang: "javascript" },
  { id: "python", label: "Python", code: CODE_PYTHON, lang: "python" },
  { id: "php", label: "PHP", code: CODE_PHP, lang: "php" },
  { id: "curl", label: "cURL", code: CODE_CURL, lang: "bash" },
];

export default function EmailApiDocsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("node");
  const [copied, setCopied] = useState(false);

  const activeCode = TABS.find(t => t.id === tab)?.code || "";

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied to clipboard!" });
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <a href="/" className="flex items-center gap-2" data-testid="link-home">
            <span className="font-bold text-lg">Afro AI</span>
          </a>
          <div className="flex items-center gap-3">
            <a href="/developer-email">
              <Button variant="ghost" size="sm" data-testid="link-email-api">Email API</Button>
            </a>
            <a href="/login">
              <Button size="sm" data-testid="button-get-started">Get Started <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-12 px-4 text-center">
        <div className="max-w-3xl mx-auto space-y-4">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            <BookOpen className="w-3 h-3 mr-1" /> Documentation
          </Badge>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold leading-tight" data-testid="text-page-title">
            How to send emails from your website
            <span className="text-primary block mt-1">using Afro AI</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Send transactional emails — welcome messages, password resets, receipts, newsletters — from your own domain. Step-by-step guide below.
          </p>
        </div>
      </section>

      {/* Steps overview */}
      <section className="px-4 pb-12">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-6">
              <h2 className="font-semibold text-sm text-muted-foreground mb-4 uppercase tracking-wide">7-step setup</h2>
              <ol className="space-y-2">
                {STEPS.map(s => (
                  <li key={s.id} className="flex items-center gap-3" data-testid={`step-overview-${s.id}`}>
                    <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {s.id}
                    </div>
                    <span className="text-sm">{s.title}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Detailed steps */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Step 1 */}
          <StepCard num={1} title="Create your Afro AI account">
            <p>Go to <a href="/" className="text-primary underline">afroaigroup.com</a> and sign up with Google or GitHub. It's free.</p>
          </StepCard>

          {/* Step 2 */}
          <StepCard num={2} title="Open the Email API">
            <p>In your dashboard sidebar, click <strong>Email API</strong>. You'll see two tabs: <strong>Domains</strong> and <strong>API Keys</strong>.</p>
          </StepCard>

          {/* Step 3 */}
          <StepCard num={3} title="Add your domain">
            <p>Go to the <strong>Domains</strong> tab → click <strong>Add Domain</strong>. Type your domain (e.g. <code className="bg-muted px-1.5 py-0.5 rounded text-xs">mywebsite.com</code>) — no <code className="bg-muted px-1.5 py-0.5 rounded text-xs">www</code> or <code className="bg-muted px-1.5 py-0.5 rounded text-xs">https://</code>.</p>
            <p>Afro AI will give you DNS records to copy: <strong>3 DKIM records</strong> (CNAME) and <strong>1 SPF record</strong> (TXT).</p>
          </StepCard>

          {/* Step 4 */}
          <StepCard num={4} title="Add the DNS records to your domain">
            <p>Open the DNS settings of wherever you bought your domain (Cloudflare, GoDaddy, Namecheap, Hostinger, etc.).</p>
            <p>For each record Afro AI gave you:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong>Type:</strong> CNAME or TXT (as shown)</li>
              <li><strong>Name/Host:</strong> paste exactly what Afro AI shows</li>
              <li><strong>Value/Target:</strong> paste exactly what Afro AI shows</li>
              <li><strong>TTL:</strong> leave default</li>
            </ul>
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <span><strong>Cloudflare users:</strong> turn the orange cloud <strong>OFF</strong> (DNS-only) for the DKIM CNAMEs.</span>
            </div>
          </StepCard>

          {/* Step 5 */}
          <StepCard num={5} title="Wait for verification">
            <p>Back in Afro AI → <strong>Email API → Domains</strong> → click <strong>Refresh Status</strong>.</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Status changes from</span>
              <Badge variant="secondary" className="text-xs">pending</Badge>
              <span>to</span>
              <Badge className="text-xs bg-green-500/15 text-green-500 border-green-500/30">verified</Badge>
              <span>— usually 5–30 min, sometimes up to 24h.</span>
            </div>
          </StepCard>

          {/* Step 6 */}
          <StepCard num={6} title="Create an API key">
            <p>Click the <strong>API Keys</strong> tab → <strong>Create New Key</strong>. Give it a name (e.g. "Production").</p>
            <p>Copy the secret key starting with <code className="bg-muted px-1.5 py-0.5 rounded text-xs">sk_live_...</code></p>
            <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <span><strong>Save it now</strong> — you won't see it again.</span>
            </div>
          </StepCard>

          {/* Step 7 */}
          <StepCard num={7} title="Send your first email">
            <p>Add this code to your website's backend. Pick your language:</p>

            {/* Tabs */}
            <div className="flex gap-1 border-b mt-2">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  data-testid={`tab-${t.id}`}
                  className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Code block */}
            <div className="relative">
              <pre className="rounded-lg bg-zinc-950 dark:bg-zinc-900 text-zinc-100 p-4 text-xs overflow-x-auto border" data-testid={`code-${tab}`}>
                <code>{activeCode}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 h-7 gap-1.5"
                onClick={() => copy(activeCode)}
                data-testid="button-copy-code"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">Replace <code className="bg-muted px-1 rounded">sk_live_YOUR_KEY_HERE</code> with the key from Step 6, and <code className="bg-muted px-1 rounded">hello@mywebsite.com</code> with any address on your verified domain.</p>
          </StepCard>
        </div>
      </section>

      {/* Use cases */}
      <section className="px-4 pb-16 bg-muted/20 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-center">Common use cases</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { title: "Welcome emails", desc: "Greet new sign-ups with onboarding tips" },
              { title: "Password resets", desc: "Send reset links with secure tokens" },
              { title: "Order confirmations", desc: "Receipts and shipping updates" },
              { title: "Newsletters", desc: "Weekly updates to your subscribers" },
              { title: "Contact form replies", desc: "Notify your team of new messages" },
              { title: "OTP / 2FA codes", desc: "Login verification codes" },
            ].map(u => (
              <Card key={u.title} data-testid={`usecase-${u.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm mb-1">{u.title}</h3>
                  <p className="text-xs text-muted-foreground">{u.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-center">Troubleshooting</h2>
          <div className="space-y-3">
            {[
              { q: '"Invalid API key"', a: "Make sure you copied the full key starting with sk_live_." },
              { q: '"Email address is not verified"', a: "Your domain status isn't verified yet. Wait or re-check your DNS records." },
              { q: "Emails go to spam", a: "Make sure all DKIM CNAME records are added correctly. Add a DMARC record for best deliverability." },
              { q: "Need help?", a: "Email support@afroaigroup.com — we usually reply within a few hours." },
            ].map((item, i) => (
              <Card key={i} data-testid={`trouble-${i}`}>
                <CardContent className="p-4">
                  <p className="font-semibold text-sm mb-1">{item.q}</p>
                  <p className="text-sm text-muted-foreground">{item.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 text-center">
        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="text-2xl font-bold">Ready to send your first email?</h2>
          <p className="text-muted-foreground">Free tier includes 1,000 emails per month. No credit card needed.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href="/login">
              <Button size="lg" className="gap-2" data-testid="button-cta-start">
                Start Free <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <a href="/developer-email">
              <Button variant="outline" size="lg" className="gap-2" data-testid="button-cta-pricing">
                See Pricing <ChevronRight className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <a href="/" className="hover:text-foreground">Home</a>
          <a href="/developer-email" className="hover:text-foreground">Email API</a>
          <a href="/contact" className="hover:text-foreground">Contact</a>
          <a href="/privacy" className="hover:text-foreground">Privacy</a>
        </div>
        <p className="mt-3">© {new Date().getFullYear()} Afro AI · KEYO TECHNOLOGIES</p>
      </footer>
    </div>
  );
}

function StepCard({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <Card data-testid={`step-card-${num}`}>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
            {num}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <h3 className="text-xl font-semibold">{title}</h3>
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
