import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home-logo">
              <img src={afroLogo} alt="Afro AI" className="w-8 h-8 object-contain" />
              <span className="font-bold text-lg">Afro AI</span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSelector compact />
            <ThemeToggle />
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-neutral dark:prose-invert">
          <h1 className="font-serif text-4xl font-bold mb-2" data-testid="text-page-title">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: February 2026</p>

          <h2>1. Information We Collect</h2>
          <p>When you use Afro AI, we collect the following information:</p>
          <ul>
            <li><strong>Account Information:</strong> Your name, email address, and profile picture provided through Google OAuth sign-in.</li>
            <li><strong>Project Data:</strong> The websites and apps you create using our platform, including code, content, and design elements.</li>
            <li><strong>Usage Data:</strong> Information about how you interact with our platform, including pages visited, features used, and time spent.</li>
            <li><strong>Uploaded Content:</strong> Files, images, and other media you upload to the platform for use in your projects.</li>
          </ul>

          <h2>2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Provide and maintain the Afro AI platform</li>
            <li>Generate AI-powered code and designs for your projects</li>
            <li>Publish your apps to custom subdomains on afroaigroup.com</li>
            <li>Improve our AI models and platform features</li>
            <li>Communicate with you about updates, features, and support</li>
            <li>Ensure platform security and prevent abuse</li>
          </ul>

          <h2>3. Data Storage and Security</h2>
          <p>Your data is stored securely using industry-standard encryption and security practices. We use PostgreSQL databases with encrypted connections and store your authentication securely through Google OAuth 2.0.</p>

          <h2>4. Data Sharing</h2>
          <p>We do not sell your personal information. We may share data with:</p>
          <ul>
            <li><strong>Service Providers:</strong> Third-party services that help us operate the platform (e.g., Cloudflare for DNS, OpenAI for AI capabilities).</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and the safety of our users.</li>
          </ul>

          <h2>5. Published Apps</h2>
          <p>When you publish an app to a subdomain on afroaigroup.com, the published content becomes publicly accessible. You are responsible for the content you publish.</p>

          <h2>6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access and download your personal data</li>
            <li>Delete your account and associated data</li>
            <li>Unpublish your apps from our platform</li>
            <li>Opt out of non-essential communications</li>
          </ul>

          <h2>7. Cookies</h2>
          <p>We use essential cookies for authentication and session management. We do not use third-party tracking cookies.</p>

          <h2>8. Changes to This Policy</h2>
          <p>We may update this privacy policy from time to time. We will notify you of any significant changes through the platform or via email.</p>

          <h2>9. Contact Us</h2>
          <p>If you have questions about this privacy policy, please contact us at <a href="mailto:Support@afroaigroup.com" className="text-primary">Support@afroaigroup.com</a> or call/WhatsApp us at <a href="https://wa.me/256777815214" className="text-primary">+256 777 815 214</a>.</p>
        </div>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Afro AI. All rights reserved. Made with love for Africa.</p>
      </footer>
    </div>
  );
}
