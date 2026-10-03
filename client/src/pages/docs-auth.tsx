import type { ReactNode } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

const sections = [
  ["scope", "Scope & capabilities"],
  ["signup", "Signup & login"],
  ["recovery", "Verification & recovery"],
  ["sessions", "Sessions & logout"],
  ["oauth", "Google & GitHub / PKCE"],
  ["origins", "Allowed origins"],
  ["verify", "Server-side verification"],
  ["errors", "Errors & rate limits"],
  ["security", "Security limitations"],
] as const;

const endpoints = [
  ["POST", "/signup", "email, password; optional firstName / lastName"],
  ["POST", "/login", "email, password"],
  ["POST", "/send-verification", "email"],
  ["POST", "/forgot-password", "email"],
  ["GET / POST", "/verify-email", "Hosted form; JSON POST: token"],
  ["GET / POST", "/reset-password", "Hosted form; JSON POST: token, password"],
  ["GET", "/me", "Bearer user token"],
  ["GET", "/sessions", "Bearer user token"],
  ["DELETE", "/sessions/:id", "Bearer user token; owned session only"],
  ["POST", "/logout or /logout-all", "Bearer user token; empty JSON object"],
  ["POST", "/oauth/exchange", "code, code_verifier, redirect_uri"],
];

function Snippet({ children }: { children: string }) {
  return <pre className="max-w-full overflow-x-auto rounded-lg border bg-card p-4 sm:p-6 text-xs sm:text-sm leading-relaxed font-mono"><code>{children}</code></pre>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-5">
      <h2 className="font-serif text-2xl md:text-3xl font-bold">{title}</h2>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function AuthDocsPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <img src={afroLogo} alt="" className="w-8 h-8 object-contain" />Afro AI
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/afro-auth"><ArrowLeft className="w-4 h-4 mr-1" />Afro Auth</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        <div className="max-w-3xl mb-12 space-y-5">
          <Badge variant="outline"><ShieldCheck className="w-3.5 h-3.5 mr-2" />Developer documentation</Badge>
          <h1 className="font-serif text-4xl md:text-5xl font-bold" data-testid="text-auth-docs-title">Afro Auth <span className="text-primary">integration guide</span></h1>
          <p className="text-lg text-muted-foreground">Customer-app authentication for developers worldwide. Built in Africa.</p>
          <p className="text-sm text-muted-foreground">Release contract: email confirmation before sign-in, revocable sessions, and OAuth authorization-code exchange with PKCE. These examples are documentation only; this page does not collect secrets or send authentication requests.</p>
          <a href="/openapi.json" className="inline-block text-sm font-medium text-primary underline underline-offset-4" data-testid="link-auth-openapi">OpenAPI specification</a>
        </div>
        <div className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-10 lg:gap-16">
          <aside>
            <nav aria-label="Documentation contents" className="md:sticky md:top-24 rounded-lg border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider mb-4">On this page</p>
              <ul className="space-y-3 text-sm">
                {sections.map(([id, label]) => <li key={id}><a href={`#${id}`} className="text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">{label}</a></li>)}
              </ul>
            </nav>
          </aside>
          <article className="min-w-0 max-w-4xl space-y-14">
            <Section id="scope" title="Scope & capabilities">
              <p>Afro Auth is custom, tenant-scoped authentication for your customer application, not Clerk and not the Afro AI platform login. Each project uses its own slug. All customer routes below are relative to <code className="text-foreground">/cf-auth/t/:slug</code>.</p>
              <p>Capabilities in this release: email/password signup and login, email confirmation and resend, password recovery, live session listing and revocation, Google/GitHub sign-in with PKCE, exact allowed origins, and server-side session verification.</p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Customer authentication endpoints</caption>
                  <thead className="bg-card text-foreground"><tr><th className="p-3">Method</th><th className="p-3">Route</th><th className="p-3">Input</th></tr></thead>
                  <tbody>{endpoints.map(([method, route, input]) => <tr key={route} className="border-t"><td className="p-3 whitespace-nowrap font-mono text-xs">{method}</td><td className="p-3 font-mono text-xs whitespace-nowrap">{route}</td><td className="p-3">{input}</td></tr>)}</tbody>
                </table>
              </div>
            </Section>
            <Section id="signup" title="Signup starts verification, not a session">
              <p>New and reset passwords must contain 12–128 characters. Existing passwords still work after email verification. Signup returns <code className="text-foreground">{'{ verificationRequired: true, user }'}</code> without a token and sends one confirmation email. Unverified accounts cannot log in; existing accounts can request confirmation through <code>/send-verification</code>.</p>
              <Snippet>{`const base = "https://afroaigroup.com/cf-auth/t/YOUR_PROJECT_SLUG";

async function post(path, body) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

const signup = await post("/signup", {
  email, password, firstName, lastName
});
// signup.verificationRequired === true; no signup token.
// Show a "Check your email" screen.
// The user submits the emailed confirmation form before login.

const login = await post("/login", { email, password });
// Keep login.token in memory or in a secure server-side session.
// Handle expired/revoked sessions by asking the user to log in again.`}</Snippet>
              <p>Signup explicitly reports email delivery failure while retaining the account for a later resend. Do not assume a failed email means no account was created.</p>
            </Section>
            <Section id="recovery" title="Hosted confirmation & password recovery">
              <p>Email links open hosted forms. Fetching or previewing a verification link does not activate the account; confirmation requires a POST. The hosted reset form also requires submission. For your own forms, JSON POST accepts a verification <code>token</code>, or a reset <code>token</code> and <code>password</code>.</p>
              <Snippet>{`// Uses the post() helper from the signup example.
await post("/send-verification", { email });
await post("/forgot-password", { email });
// Show a generic acknowledgement, not an account-exists message.

// Optional custom forms: submit only after the user's action.
await post("/verify-email", { token: confirmationToken });
await post("/reset-password", {
  token: resetToken,
  password: newPassword // 12–128 characters
});`}</Snippet>
              <p>Recovery requests use generic responses to prevent account discovery and do not guarantee delivery. A successful reset invalidates this user's sessions and outstanding recovery/authorization links in this tenant only. It does not sign the user in automatically; send them back to login.</p>
            </Section>
            <Section id="sessions" title="24-hour sessions & logout">
              <p>Tenant JWTs expire after 24 hours and require a live session record. Legacy stateless JWTs are rejected. There is no refresh-token rotation in this release; expired sessions require a new login.</p>
              <Snippet>{`// base is your tenant URL; userToken is the login token.
async function sessionRequest(path, method = "GET") {
  const response = await fetch(base + path, {
    method,
    headers: {
      Authorization: \`Bearer \${userToken}\`,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {})
    },
    ...(method === "POST" ? { body: "{}" } : {})
  });
  if (!response.ok) throw new Error("Session request failed");
  return response;
}

const me = await (await sessionRequest("/me")).json();
const sessions = await (await sessionRequest("/sessions")).json();
await sessionRequest("/sessions/" + encodeURIComponent(sessionId), "DELETE");
// You can revoke only a session owned by the current user.
await sessionRequest("/logout", "POST");     // current session
// Or: await sessionRequest("/logout-all", "POST");
// Clear your application's local token/session state after logout.`}</Snippet>
            </Section>
            <Section id="oauth" title="Google & GitHub with PKCE">
              <p>Generate a high-entropy verifier in the integrating client and retain it in that browser session. Derive a SHA-256 base64url challenge. Use <code>/cf-auth/google/start</code> or <code>/cf-auth/github/start</code> with the tenant slug, exact redirect URI, and challenge. Register the callback origin first. The provider flow is bound to an HttpOnly state cookie.</p>
              <Snippet>{`// Browser: start a provider flow.
const base64url = bytes => btoa(String.fromCharCode(...bytes))
  .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const digest = await crypto.subtle.digest(
  "SHA-256", new TextEncoder().encode(verifier)
);
const challenge = base64url(new Uint8Array(digest));
const redirectUri = "https://YOUR_APP.example/auth/callback";
sessionStorage.setItem("afro_pkce_verifier", verifier);
sessionStorage.setItem("afro_pkce_redirect", redirectUri);

const start = new URL("https://afroaigroup.com/cf-auth/google/start");
// For GitHub, use /cf-auth/github/start.
start.searchParams.set("tenant", "YOUR_PROJECT_SLUG");
start.searchParams.set("redirect_uri", redirectUri);
start.searchParams.set("code_challenge", challenge);
window.location.assign(start.toString());`}</Snippet>
              <p>The callback returns a single-use code valid for 60 seconds, not a JWT in the URL. Remove the code from the URL before exchanging it with the original verifier and identical redirect URI. Never accept a verifier supplied by another browser.</p>
              <Snippet>{`// Browser: on your registered callback page.
const callback = new URL(window.location.href);
const code = callback.searchParams.get("code");
callback.searchParams.delete("code");
window.history.replaceState({}, "", callback.pathname + callback.search + callback.hash);

const verifier = sessionStorage.getItem("afro_pkce_verifier");
const redirectUri = sessionStorage.getItem("afro_pkce_redirect");
sessionStorage.removeItem("afro_pkce_verifier");
sessionStorage.removeItem("afro_pkce_redirect");
if (!code || !verifier || !redirectUri) {
  throw new Error("Start sign-in again from this browser");
}
const result = await post("/oauth/exchange", {
  code,
  code_verifier: verifier,
  redirect_uri: redirectUri
});
// Handle result.token like a login token, never as a URL parameter.`}</Snippet>
              <p>Email verification comes from Google's verified-email claim or GitHub's verified email list. Real provider consent flows still require post-release checks.</p>
            </Section>
            <Section id="origins" title="Configure exact allowed origins">
              <p>Set exact browser origins in the project dashboard before switching clients. An empty list denies cross-origin browser calls. HTTPS is required except for HTTP localhost or 127.0.0.1. Legacy comma-separated settings remain readable.</p>
              <Snippet>{`// Example dashboard origin entries (replace with your own):
https://YOUR_APP.example
http://localhost:5173
http://127.0.0.1:5173

// Origin = scheme + hostname + port (when present).
// The OAuth redirect_uri must remain identical during exchange.`}</Snippet>
              <p>An allowed browser origin is not authorization. Your server must still verify the user's live session and enforce permissions.</p>
            </Section>
            <Section id="verify" title="Verify every protected operation on your server">
              <p>Call <code className="text-foreground">/cf-auth/v1/sessions/verify</code> with your server-only <code>sk_</code> key and the user token on every protected operation. Offline signature validation alone cannot enforce revocation. Never send the secret key to browser code or commit it to source control.</p>
              <Snippet>{`// SERVER ONLY. Load the secret from your server's environment.
const secretKey = process.env.AFRO_AUTH_SECRET_KEY;
if (!secretKey) throw new Error("Missing server authentication key");

const response = await fetch(
  "https://afroaigroup.com/cf-auth/v1/sessions/verify",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${secretKey}\`
    },
    body: JSON.stringify({ token: userToken })
  }
);
if (!response.ok) throw new Error("Session verification failed");
const session = await response.json();
if (!session.valid) throw new Error("Sign in again");
// Use the verified user for your own authorization checks.
// Reject the operation if verification is unavailable or fails.`}</Snippet>
            </Section>
            <Section id="errors" title="Errors & rate limits">
              <p>Always check HTTP success before treating a response as a completed operation. The release notes define the outcomes below, not a stable list of numeric status codes or machine-readable error names; do not hardcode undocumented error identifiers.</p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Release-defined error conditions and client handling</caption>
                  <thead className="bg-card text-foreground"><tr><th className="p-3">Condition</th><th className="p-3">Client handling</th></tr></thead>
                  <tbody>
                    {[
                      ["Unverified account", "Login is blocked. Offer email confirmation/resend."],
                      ["Expired, revoked, or legacy token", "Stop protected actions and require a new login."],
                      ["Invalid new/reset password", "Require 12–128 characters before submission."],
                      ["Signup email delivery failure", "The account is retained; offer a later resend."],
                      ["Recovery acknowledgement", "Show a generic message; it does not prove account existence or delivery."],
                      ["Issuance cooldown or rate limit", "Wait and retry deliberately; do not create an automatic request loop."],
                      ["Origin not allowed", "Check the exact origin in dashboard settings; an empty list denies cross-origin calls."],
                      ["Expired/used OAuth code or mismatched exchange", "Restart the flow in the same browser; do not reuse a code or substitute a verifier."],
                      ["Unowned session deletion", "Only revoke sessions belonging to the current user."],
                    ].map(([condition, handling]) => <tr key={condition} className="border-t"><td className="p-3 align-top font-medium text-foreground">{condition}</td><td className="p-3">{handling}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <p>Email issuance has a one-minute account cooldown plus IP/email rate limits. The source does not specify numeric IP/email quotas. Recovery responses deliberately avoid revealing account existence. Email failures are logged without credentials.</p>
            </Section>
            <Section id="security" title="Security boundaries & release limitations">
              <Card className="border-primary/30">
                <CardContent className="p-6 space-y-3">
                  <p className="font-semibold text-foreground">Documentation is not proof of production rollout.</p>
                  <p>SQLite-backed tests exercise real SQL and JWTs with mocked email and OAuth network calls. They do not perform a production migration, real email delivery, or real provider consent. Confirm rollout and exercise the actual customer origins before advertising live availability.</p>
                </CardContent>
              </Card>
              <ul className="list-disc pl-5 space-y-3">
                <li>Validate signup → email confirmation → login → logout, password reset across two sessions, and both configured OAuth providers after release.</li>
                <li>Protect the server-only secret key. Keep user tokens out of URLs and choose a safe application session strategy; this page offers no secret-key input or live request demo.</li>
                <li>Live verification enforces session revocation; your application is responsible for its own authorization.</li>
                <li>Refresh-token rotation is not included. Signing-key rotation and platform cookie-domain changes are separate work.</li>
                <li>Password reset revokes sessions and outstanding recovery/authorization links for this user in this tenant only.</li>
                <li>Do not revert the verifier to stateless JWT acceptance: that would restore acceptance of revoked credentials.</li>
              </ul>
              <p>Source: <code>docs/tenant-auth-release.md</code>. This guide documents its customer integration contract, not deployment instructions or unverified service guarantees.</p>
            </Section>
          </article>
        </div>
      </main>
      <footer className="border-t py-8 px-4 text-center text-sm text-muted-foreground">
        <div className="flex flex-wrap justify-center gap-5 mb-4">
          <Link href="/afro-auth" className="hover:text-primary">Afro Auth</Link>
          <a href="/openapi.json" className="hover:text-primary">OpenAPI</a>
          <a href="/.well-known/security.txt" className="hover:text-primary">Security disclosure</a>
        </div>
        <p>&copy; {new Date().getFullYear()} KEYO TECHNOLOGIES. Afro AI.</p>
      </footer>
    </div>
  );
}