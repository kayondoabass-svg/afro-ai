import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { useLanguage } from "@/hooks/use-language";
import { ArrowLeft, Mail, MapPin, Clock, Phone, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

const SERVICE_LABELS: Record<string, string> = {
  "sms-payg": "Bulk SMS — Pay As You Go",
  "sms-business": "Bulk SMS — Business Pack",
  "sms-enterprise": "Bulk SMS — Enterprise quote",
  "ussd-starter": "USSD Builder — Starter",
  "ussd-growth": "USSD Builder — Growth",
  "ussd-enterprise": "USSD Builder — Enterprise quote",
  "whatsapp-setup": "WhatsApp — Setup",
  "whatsapp-business": "WhatsApp — Business",
  "whatsapp-scale": "WhatsApp — Scale quote",
  "airtime-standard": "Airtime API — Standard",
  "airtime-volume": "Airtime API — High Volume quote",
  "momo-collect": "Mobile Money — Collections",
  "momo-bundle": "Mobile Money — Collect + Payout",
  "momo-marketplace": "Mobile Money — Marketplace quote",
  "consultation": "General consultation",
};

function getServicePrefill(): { subject: string; message: string } {
  if (typeof window === "undefined") return { subject: "", message: "" };
  const params = new URLSearchParams(window.location.search);
  const service = params.get("service");
  if (!service) return { subject: "", message: "" };
  const label = SERVICE_LABELS[service] || service;
  return {
    subject: `Inquiry: ${label}`,
    message: `Hi Afro AI team,\n\nI'd like to learn more about your ${label} offering.\n\nMy business: \nMonthly volume / use case: \nCountry: \n\nPlease send pricing and next steps.\n\nThanks!`,
  };
}

export default function ContactPage() {
  const { t } = useLanguage();
  const prefill = getServicePrefill();

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <img src={afroLogo} alt="Afro AI" className="w-8 h-8 object-contain" />
              <span className="font-bold text-lg">Afro AI</span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSelector compact />
            <ThemeToggle />
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 space-y-4">
            <h1 className="font-serif text-4xl md:text-5xl font-bold">
              Contact <span className="text-primary">Us</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              We'd love to hear from you. Reach out to us for any questions, feedback, or partnership opportunities.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold">Email Us</h3>
                <p className="text-sm text-muted-foreground">For inquiries and support</p>
                <a href="mailto:Support@afroaigroup.com" className="text-primary text-sm font-medium hover:underline" data-testid="link-email">
                  Support@afroaigroup.com
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Phone className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold">Call Us</h3>
                <p className="text-sm text-muted-foreground">Direct phone call</p>
                <a href="tel:+256777815214" className="text-primary text-sm font-medium hover:underline" data-testid="link-phone">
                  +256 777 815 214
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <MessageCircle className="w-6 h-6 text-green-500" />
                </div>
                <h3 className="font-semibold">WhatsApp</h3>
                <p className="text-sm text-muted-foreground">Chat with us directly</p>
                <a href="https://wa.me/256777815214" target="_blank" rel="noopener noreferrer" className="text-green-500 text-sm font-medium hover:underline" data-testid="link-whatsapp">
                  +256 777 815 214
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold">Location</h3>
                <p className="text-sm text-muted-foreground">Serving all of Africa</p>
                <p className="text-primary text-sm font-medium">Kampala, Uganda</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-8 space-y-6">
              <h2 className="font-serif text-2xl font-bold text-center">Send Us a Message</h2>
              <form
                className="space-y-4 max-w-lg mx-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const subject = encodeURIComponent(`Afro AI Contact: ${formData.get("subject")}`);
                  const body = encodeURIComponent(`Name: ${formData.get("name")}\nEmail: ${formData.get("email")}\n\n${formData.get("message")}`);
                  window.location.href = `mailto:Support@afroaigroup.com?subject=${subject}&body=${body}`;
                }}
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <input
                    name="name"
                    type="text"
                    required
                    className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Your name"
                    data-testid="input-contact-name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    name="email"
                    type="email"
                    required
                    className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="your@email.com"
                    data-testid="input-contact-email"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <input
                    name="subject"
                    type="text"
                    required
                    defaultValue={prefill.subject}
                    className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="What's this about?"
                    data-testid="input-contact-subject"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Message</label>
                  <textarea
                    name="message"
                    required
                    rows={5}
                    defaultValue={prefill.message}
                    className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Tell us how we can help..."
                    data-testid="input-contact-message"
                  />
                </div>
                <Button type="submit" className="w-full" data-testid="button-contact-submit">
                  Send Message
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} KEYO TECHNOLOGIES. All rights reserved. Afro AI — Made with love for Africa.</p>
      </footer>
    </div>
  );
}
