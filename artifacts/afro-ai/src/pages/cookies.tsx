import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export default function CookiePolicyPage() {
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
          <h1 className="font-serif text-4xl font-bold mb-2" data-testid="text-page-title">Cookie Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: February 2026</p>

          <h2>1. What Are Cookies</h2>
          <p>Cookies are small text files stored on your device when you visit a website. They help the website remember your preferences and improve your experience.</p>

          <h2>2. Cookies We Use</h2>
          <p>Afro AI uses only essential cookies that are necessary for the platform to function properly:</p>

          <h3>Essential Cookies</h3>
          <ul>
            <li><strong>Session Cookie:</strong> Keeps you signed in while you use the platform. This cookie is deleted when you close your browser or sign out.</li>
            <li><strong>Authentication Cookie:</strong> Verifies your identity after you sign in with Google OAuth. Required for accessing your dashboard and projects.</li>
            <li><strong>Theme Preference:</strong> Remembers whether you prefer dark or light mode.</li>
            <li><strong>Language Preference:</strong> Remembers your selected language so the platform displays in your preferred language.</li>
          </ul>

          <h2>3. Third-Party Cookies</h2>
          <p>We do not use any third-party tracking cookies, advertising cookies, or analytics cookies. Your browsing activity is not tracked or shared with advertisers.</p>

          <h2>4. Managing Cookies</h2>
          <p>Since we only use essential cookies, disabling them may prevent the platform from working correctly. You can manage cookies through your browser settings:</p>
          <ul>
            <li><strong>Chrome:</strong> Settings &gt; Privacy and Security &gt; Cookies</li>
            <li><strong>Safari:</strong> Preferences &gt; Privacy</li>
            <li><strong>Firefox:</strong> Settings &gt; Privacy &amp; Security</li>
          </ul>

          <h2>5. Changes to This Policy</h2>
          <p>If we introduce new types of cookies in the future, we will update this policy and notify you through the platform.</p>

          <h2>6. Contact Us</h2>
          <p>For questions about our cookie policy, contact us at <a href="mailto:Support@afroaigroup.com" className="text-primary">Support@afroaigroup.com</a> or call/WhatsApp us at <a href="https://wa.me/256777815214" className="text-primary">+256 777 815 214</a>.</p>
        </div>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} KEYO TECHNOLOGIES. All rights reserved. Afro AI — Made with love for Africa.</p>
      </footer>
    </div>
  );
}
