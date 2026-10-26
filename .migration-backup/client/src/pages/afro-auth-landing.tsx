import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Globe2, ShieldCheck, Code2, Zap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AUTH_PACKAGES } from "@shared/auth-packages";

const TIER_DETAILS: Record<string, { features: string[]; cta: string; highlight: boolean }> = {
  free: {
    features: ["Email and password authentication", "Hosted verification and password recovery", "Revocable customer sessions", "1 owned Afro Auth project"],
    cta: "Start free", highlight: false,
  },
  builder: {
    features: ["Everything in Starter", "Custom sender name, reply-to, logo and color", "1 owned Afro Auth project", "25,000 monthly active users"],
    cta: "Choose Builder", highlight: true,
  },
  business: {
    features: ["Everything in Builder", "Verified sender domain from your owned Email API project", "Custom verification and recovery copy", "White-label email identity · up to 5 owned projects"],
    cta: "Choose Business", highlight: false,
  },
  scale: {
    features: ["Everything in Business", "Custom HTML verification and recovery templates", "500,000 monthly active users", "Unlimited owned Afro Auth projects"],
    cta: "Choose Scale", highlight: false,
  },
};

const TIERS = Object.values(AUTH_PACKAGES).map((pkg) => {
  const key = String(pkg.key).toLowerCase();
  const details = TIER_DETAILS[key] ?? { features: [], cta: `Choose ${pkg.name}`, highlight: false };
  return {
    ...details,
    key,
    name: pkg.name,
    price: Number(pkg.usd) === 0 ? "Free" : `$${pkg.usd}`,
    sub: Number(pkg.usd) === 0 ? "forever" : "/ month · prepaid 30 days",
    mau: Number(pkg.mau).toLocaleString(),
    apps: Number(pkg.apps) === -1 ? "unlimited" : pkg.apps,
    appCount: pkg.apps,
  };
});

export default function AfroAuthLandingPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const ctaHref = user ? "/dashboard/auth" : "/login?redirect=/dashboard/auth";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <Badge className="mb-4" variant="secondary" data-testid="badge-built-in-africa">
            Built in Africa, for developers worldwide
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4" data-testid="text-hero-title">
            Afro Auth
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-8" data-testid="text-hero-tagline">
            Give your app its own identity. Afro Auth handles the authentication plumbing while you keep your secrets on your server.
            Built in Africa for teams shipping anywhere in the world.
          </p>
          <div className="flex flex-wrap gap-3 justify-center" data-testid="container-hero-cta">
            <Button
              size="lg"
              onClick={() => setLocation(ctaHref)}
              disabled={isLoading}
              data-testid="button-get-started"
            >
              Get started free
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs/auth#start">Follow the setup guide</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                const el = document.getElementById("pricing");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              data-testid="button-see-pricing"
            >
              See pricing
            </Button>
          </div>
        </div>
      </section>

      {/* Why Afro Auth */}
      <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
        <FeatureCard
          icon={<Zap className="h-6 w-6" />}
          title="Confirm email before sign-in"
          body="Signup asks the customer to confirm the address they entered. No login token is issued until they confirm and sign in."
          testId="card-feature-fast"
        />
        <FeatureCard
          icon={<Globe2 className="h-6 w-6" />}
          title="Build for users worldwide"
          body="Configure exact allowed origins for your app. Use the JSON API or hosted email confirmation and password-reset forms."
          testId="card-feature-mm"
        />
        <FeatureCard
          icon={<Code2 className="h-6 w-6" />}
          title="Sessions you can revoke"
          body="Tokens expire after 24 hours and require a live session. Verify each protected operation from your backend."
          testId="card-feature-future"
        />
      </section>

      {/* Code snippet */}
      <section className="bg-muted/30 border-y">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2" data-testid="text-code-section-title">
              Plug it into your app
            </h2>
            <p className="text-muted-foreground">Signup starts email verification. After confirmation, call login to create a session.</p>
          </div>
          <pre
            className="bg-card border rounded-lg p-6 overflow-x-auto text-sm font-mono"
            data-testid="code-snippet"
          >
{`// Configure your app's exact allowed origin first.
// New passwords must contain 12–128 characters.
const res = await fetch(
  "https://afroaigroup.com/cf-auth/t/your-app-slug/signup",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }
);
const data = await res.json();
if (!res.ok) throw new Error(data.message || "Signup failed");
// → { verificationRequired: true, user }
// Ask the user to confirm via the emailed POST form.
// Signup does NOT return a token.
// After confirmation, POST { email, password } to /login.
// Keep the resulting token in memory or a secure server-side session.
// Never expose your sk_ key in browser code.`}
          </pre>
          <div className="flex flex-wrap gap-4 mt-6 text-sm text-primary">
            <Link href="/docs/auth#start" className="hover:underline">Complete setup, from project to live session</Link>
            <a href="/openapi.json" className="hover:underline">OpenAPI specification</a>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Website ownership TXT proof, browser origins, and customer mailbox confirmation are separate steps. The guide explains what each one proves and how to test the whole flow.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-2" data-testid="text-pricing-title">
            Plans for your next app
          </h2>
          <p className="text-muted-foreground">
            Four clear limits: active users, owned app count, email branding, and a 30-day prepaid term on paid packages.
          </p>
        </div>
        <p className="mb-5 text-center text-sm text-muted-foreground">Choose a plan, then select one of your owned projects in the dashboard. Paid access is prepaid for 30 days and does not renew automatically.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((tier) => (
            <Card
              key={tier.key}
              className={tier.highlight ? "border-primary border-2 shadow-lg" : ""}
              data-testid={`card-tier-${tier.name.toLowerCase()}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle data-testid={`text-tier-name-${tier.key}`}>{tier.name}</CardTitle>
                  {tier.highlight && (
                    <Badge data-testid={`badge-popular-${tier.key}`}>Popular</Badge>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-bold" data-testid={`text-tier-price-${tier.key}`}>
                    {tier.price}
                  </span>
                  <span className="text-muted-foreground">{tier.sub}</span>
                </div>
                <CardDescription data-testid={`text-tier-mau-${tier.key}`}>
                  Up to <strong>{tier.mau}</strong> monthly active users · {tier.apps}{Number(tier.appCount) === 1 ? " owned app" : " owned apps"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={tier.highlight ? "default" : "outline"}
                  onClick={() => setLocation(ctaHref)}
                  data-testid={`button-tier-cta-${tier.key}`}
                >
                  {tier.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Integration boundaries */}
      <section className="bg-muted/30 border-t">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center" data-testid="text-comparison-title">
            Know what you are integrating
          </h2>
          <Card>
            <CardContent className="p-6 space-y-4 text-sm text-muted-foreground">
              <p>Afro Auth is customer-app authentication, separate from the Afro AI platform login. Your application remains responsible for authorization and safe token handling.</p>
              <p>There is no refresh-token rotation in this release. Expired or revoked sessions require a new login; offline JWT verification alone cannot enforce revocation.</p>
              <p>Production migration, real email delivery, and provider consent flows require post-release checks. Automated tests do not establish live availability.</p>
              <Link href="/docs/auth#security" className="inline-block text-primary hover:underline">Read the security limitations</Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <ShieldCheck className="h-12 w-12 mx-auto text-primary mb-4" />
        <h2 className="text-3xl font-bold mb-2" data-testid="text-final-cta-title">
          Stop building login from scratch.
        </h2>
        <p className="text-muted-foreground mb-6">
          Create a project, select it in your dashboard, and configure its integration.
        </p>
        <Button size="lg" onClick={() => setLocation(ctaHref)} data-testid="button-final-cta">
          Create your project
        </Button>
      </section>
    </div>
  );
}

function FeatureCard({
  icon, title, body, testId,
}: { icon: React.ReactNode; title: string; body: string; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6">
        <div className="text-primary mb-3">{icon}</div>
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
