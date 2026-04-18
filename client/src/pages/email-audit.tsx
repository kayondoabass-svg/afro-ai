import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Mail, Shield, CheckCircle2, AlertTriangle, XCircle, Info,
  ArrowRight, Search, Loader2, TrendingUp, Sparkles, Lock,
} from "lucide-react";

type Status = "pass" | "warn" | "fail" | "info";

interface CheckResult {
  id: string;
  label: string;
  status: Status;
  detail: string;
  fix?: string;
  raw?: string;
}

interface AuditReport {
  domain: string;
  score: number;
  rating: "excellent" | "good" | "needs_attention" | "critical";
  spamRiskPct: number;
  detectedProvider: string | null;
  checks: CheckResult[];
  summary: string;
  generatedAt: string;
}

const RATING_COLORS: Record<AuditReport["rating"], string> = {
  excellent: "text-green-500",
  good: "text-blue-500",
  needs_attention: "text-amber-500",
  critical: "text-red-500",
};

const RATING_LABELS: Record<AuditReport["rating"], string> = {
  excellent: "Excellent",
  good: "Good",
  needs_attention: "Needs Attention",
  critical: "Critical",
};

const STATUS_ICON: Record<Status, React.ReactNode> = {
  pass: <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />,
  warn: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
  fail: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />,
};

const STATUS_BG: Record<Status, string> = {
  pass: "bg-green-500/5 border-green-500/20",
  warn: "bg-amber-500/5 border-amber-500/20",
  fail: "bg-red-500/5 border-red-500/20",
  info: "bg-blue-500/5 border-blue-500/20",
};

export default function EmailAuditPage() {
  const [, navigate] = useLocation();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState(0);

  const PROGRESS_STEPS = [
    "Resolving DNS records…",
    "Checking SPF authentication…",
    "Querying DKIM selectors…",
    "Inspecting DMARC policy…",
    "Cross-checking blacklists…",
    "Detecting your email provider…",
    "Compiling your report…",
  ];

  async function runAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim() || loading) return;
    setLoading(true);
    setError(null);
    setReport(null);
    setProgressStep(0);

    // Animated progress (visual only — real audit runs in parallel)
    const progressTimer = setInterval(() => {
      setProgressStep((s) => Math.min(s + 1, PROGRESS_STEPS.length - 1));
    }, 700);

    try {
      const res = await fetch("/api/email-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Audit failed");
      } else {
        setReport(data);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      clearInterval(progressTimer);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <span className="font-bold text-lg text-primary cursor-pointer">Afro AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/email-api")} data-testid="link-email-api">
              Email API
            </Button>
            <Button size="sm" onClick={() => navigate("/login")} className="bg-primary text-primary-foreground" data-testid="button-cta-nav">
              Get Started Free
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero + Audit input */}
      <section className="relative overflow-hidden py-16 md:py-24 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-amber-500/5 pointer-events-none" />
        <div className="max-w-3xl mx-auto relative">
          <div className="text-center mb-10">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Free · No signup required
            </Badge>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 leading-tight">
              Are your emails landing<br />
              <span className="text-primary">in spam?</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Get a free deliverability audit of your domain in 30 seconds. We check SPF, DKIM, DMARC, blacklists, and your sending provider — and tell you exactly what's broken.
            </p>
          </div>

          <Card className="border-border/50 shadow-lg">
            <CardContent className="p-6 md:p-8">
              <form onSubmit={runAudit} className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="yourbusiness.com"
                    disabled={loading}
                    className="w-full pl-10 pr-4 py-3.5 text-base bg-background border border-border/60 rounded-xl outline-none focus:border-primary/60 transition-colors disabled:opacity-50"
                    data-testid="input-audit-domain"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={loading || !domain.trim()}
                  className="bg-primary text-primary-foreground gap-2 px-6"
                  data-testid="button-audit-submit"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Auditing…
                    </>
                  ) : (
                    <>
                      Audit my domain <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              {/* Live progress */}
              {loading && (
                <div className="mt-6 space-y-2.5" data-testid="audit-progress">
                  {PROGRESS_STEPS.slice(0, progressStep + 1).map((step, i) => (
                    <div
                      key={step}
                      className={`flex items-center gap-2.5 text-sm ${
                        i === progressStep ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {i < progressStep ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      )}
                      {step}
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2" data-testid="audit-error">
                  <XCircle className="w-4 h-4" /> {error}
                </div>
              )}
            </CardContent>
          </Card>

          {!report && !loading && (
            <p className="text-xs text-muted-foreground text-center mt-4 flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3" /> We only read public DNS records. Nothing is stored.
            </p>
          )}
        </div>
      </section>

      {/* Report */}
      {report && (
        <section className="py-12 px-4" data-testid="audit-report">
          <div className="max-w-3xl mx-auto space-y-8">
            {/* Score card */}
            <Card className="border-border/50 overflow-hidden">
              <div className="p-6 md:p-8 grid md:grid-cols-[auto_1fr] gap-6 items-center bg-gradient-to-br from-primary/5 to-transparent">
                <div className="text-center">
                  <div className="relative w-32 h-32 mx-auto">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/40" />
                      <circle
                        cx="50" cy="50" r="44" fill="none"
                        stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(report.score / 100) * 276.46} 276.46`}
                        className={RATING_COLORS[report.rating]}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-4xl font-extrabold ${RATING_COLORS[report.rating]}`} data-testid="text-audit-score">
                        {report.score}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</span>
                    </div>
                  </div>
                  <Badge className={`mt-3 ${RATING_COLORS[report.rating]} bg-transparent border-current`}>
                    {RATING_LABELS[report.rating]}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Audit results for</p>
                  <h2 className="text-2xl font-bold mb-3 break-all" data-testid="text-audit-domain">{report.domain}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">{report.summary}</p>
                  {report.spamRiskPct > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="w-4 h-4 text-amber-500" />
                      <span className="font-semibold">~{report.spamRiskPct}%</span>
                      <span className="text-muted-foreground">of emails likely landing in spam</span>
                    </div>
                  )}
                  {report.detectedProvider && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Detected provider: <span className="text-foreground font-medium">{report.detectedProvider}</span>
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {/* Per-check breakdown */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold px-1">Detailed checks</h3>
              {report.checks.map((c) => (
                <Card key={c.id} className={`border ${STATUS_BG[c.status]}`} data-testid={`check-${c.id}`}>
                  <CardContent className="p-4 md:p-5">
                    <div className="flex gap-3">
                      {STATUS_ICON[c.status]}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="font-semibold text-sm">{c.label}</h4>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                            {c.status === "pass" ? "passed" : c.status === "warn" ? "warning" : c.status === "fail" ? "failed" : "info"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-2">{c.detail}</p>
                        {c.fix && (
                          <div className="text-xs bg-background/60 border border-border/40 rounded-md p-2.5 mb-2">
                            <span className="font-semibold text-foreground">How to fix: </span>
                            <span className="text-muted-foreground">{c.fix}</span>
                          </div>
                        )}
                        {c.raw && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View raw record</summary>
                            <pre className="mt-2 p-2 bg-muted/40 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all">{c.raw}</pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* CTA card */}
            <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-amber-500/5 to-primary/5 overflow-hidden">
              <CardContent className="p-6 md:p-8 text-center">
                <Sparkles className="w-10 h-10 text-primary mx-auto mb-3" />
                <h3 className="text-2xl font-bold mb-2">Fix all of this in one move</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Afro AI Email API auto-configures SPF, DKIM, and DMARC during onboarding — and you get African-currency pricing, M-Pesa billing, and 50% lower cost than SendGrid.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    size="lg"
                    onClick={() => navigate("/email-api")}
                    className="bg-primary text-primary-foreground gap-2"
                    data-testid="button-cta-email-api"
                  >
                    Switch to Afro AI Email API <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => { setReport(null); setDomain(""); }}
                    data-testid="button-audit-another"
                  >
                    Audit another domain
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-4">
                  Free 14-day trial · 1,000 emails free · No card required
                </p>
              </CardContent>
            </Card>

            <p className="text-[10px] text-center text-muted-foreground">
              Audit generated {new Date(report.generatedAt).toLocaleString()} · Public DNS data only · Re-run anytime
            </p>
          </div>
        </section>
      )}

      {/* Why this matters (only when no report yet) */}
      {!report && (
        <section className="py-16 px-4 bg-muted/20 border-y border-border/30">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3">What we check & why it matters</h2>
              <p className="text-sm text-muted-foreground">If any of these fail, your customers may never see your emails.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              {[
                { icon: Shield, title: "SPF Record", desc: "Tells receiving servers which IPs are allowed to send mail for your domain. Missing or broken SPF = mail goes to spam." },
                { icon: Lock, title: "DKIM Signing", desc: "Cryptographically signs your emails so receivers know they really came from you. Required by Gmail and Yahoo for bulk senders since 2024." },
                { icon: AlertTriangle, title: "DMARC Policy", desc: "Tells inboxes what to do with spoofed mail. Without it, anyone can send email pretending to be your domain." },
                { icon: Mail, title: "MX Records", desc: "Without MX records you can't receive bounce reports — and you'll be flagged as suspicious by major inboxes." },
                { icon: XCircle, title: "Blacklist Status", desc: "We check Spamhaus, Barracuda, SpamCop, and SORBS. One listing kills your deliverability instantly." },
                { icon: TrendingUp, title: "Provider Analysis", desc: "We detect if you're using Gmail SMTP (limited to 500/day), or a real provider — and benchmark against Afro AI Email API." },
              ].map(({ icon: Icon, title, desc }) => (
                <Card key={title} className="border-border/50">
                  <CardContent className="p-5">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <Icon className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© 2025 Afro AI · KEYO TECHNOLOGIES · Uganda</p>
          <div className="flex gap-4">
            <Link href="/email-api"><span className="hover:text-foreground cursor-pointer transition-colors">Email API</span></Link>
            <Link href="/privacy"><span className="hover:text-foreground cursor-pointer transition-colors">Privacy</span></Link>
            <Link href="/terms"><span className="hover:text-foreground cursor-pointer transition-colors">Terms</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
