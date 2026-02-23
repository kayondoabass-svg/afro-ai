import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export default function RefundPolicyPage() {
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
          <h1 className="font-serif text-4xl font-bold mb-2" data-testid="text-page-title">Refund Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: February 2026</p>

          <h2>1. No Refunds Policy</h2>
          <p>All payments made to Afro AI are <strong>final and non-refundable</strong>. Due to the nature of our service, which relies on generative AI technology, costs are incurred immediately upon usage and cannot be recovered.</p>

          <h2>2. Why We Cannot Offer Refunds</h2>
          <p>Afro AI uses advanced generative AI models (powered by OpenAI) to generate code, designs, and content for your projects. Each time you interact with our AI assistant, computational resources are consumed and charges are incurred from our AI providers. These costs are:</p>
          <ul>
            <li><strong>Immediate:</strong> AI processing charges are billed to us the moment your request is processed.</li>
            <li><strong>Non-recoverable:</strong> Once AI resources are consumed, the associated costs cannot be reversed or reclaimed.</li>
            <li><strong>Usage-based:</strong> Every message, code generation, and design request uses real computing power that has a direct cost.</li>
          </ul>

          <h2>3. What This Means for You</h2>
          <p>When you subscribe to any Afro AI plan (Starter, Pro, or Business), please understand:</p>
          <ul>
            <li>Subscription fees are charged at the beginning of each billing cycle and are non-refundable.</li>
            <li>Partial-month usage is not eligible for prorated refunds.</li>
            <li>Downgrading or cancelling your plan will take effect at the end of your current billing period.</li>
            <li>Unused AI interactions or features do not carry over or qualify for credit.</li>
          </ul>

          <h2>4. Plan Cancellation</h2>
          <p>You may cancel your subscription at any time. Upon cancellation:</p>
          <ul>
            <li>You will retain access to your current plan's features until the end of your billing period.</li>
            <li>Your account will revert to the free Starter plan after the paid period ends.</li>
            <li>Your projects, published apps, and data will remain intact.</li>
            <li>No refund will be issued for the remaining time in your billing cycle.</li>
          </ul>

          <h2>5. Exceptional Circumstances</h2>
          <p>While our general policy is no refunds, we may consider exceptions in the following rare cases at our sole discretion:</p>
          <ul>
            <li><strong>Duplicate charges:</strong> If you were accidentally charged more than once for the same billing period.</li>
            <li><strong>Technical failure:</strong> If a verified platform-wide outage prevented you from accessing the service for an extended period.</li>
            <li><strong>Unauthorized transactions:</strong> If your account was compromised and unauthorized purchases were made.</li>
          </ul>
          <p>To request a review of exceptional circumstances, please contact us within 7 days of the charge.</p>

          <h2>6. Free Starter Plan</h2>
          <p>Our free Starter plan allows you to explore Afro AI at no cost. We encourage new users to try the Starter plan before committing to a paid subscription to ensure our platform meets their needs.</p>

          <h2>7. Referral Credits</h2>
          <p>Referral credits earned through our referral program are applied as discounts toward future subscription payments. These credits are non-transferable and have no cash value. Referral credits are not refundable.</p>

          <h2>8. Contact Us</h2>
          <p>If you have questions about this refund policy or believe you qualify for an exception, please contact us at <a href="mailto:Support@afroaigroup.com" className="text-primary">Support@afroaigroup.com</a> or call/WhatsApp us at <a href="https://wa.me/256777815214" className="text-primary">+256 777 815 214</a>.</p>

          <div className="mt-12 p-6 bg-muted/50 rounded-lg border">
            <p className="text-sm text-muted-foreground mb-0"><strong>Summary:</strong> All purchases on Afro AI are final and non-refundable because generative AI costs are incurred immediately and cannot be recovered. We encourage you to use our free Starter plan to evaluate the platform before upgrading.</p>
          </div>
        </div>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Afro AI. All rights reserved. Made with love for Africa.</p>
      </footer>
    </div>
  );
}
