import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { useLanguage } from "@/hooks/use-language";
import { ArrowLeft, Users, Target, Heart, Globe, Building2, Sparkles, Calendar } from "lucide-react";
import { Link } from "wouter";
import afroLogo from "@assets/IMG_5719_1771852498362.png";


export default function AboutPage() {
  const { t } = useLanguage();

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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 space-y-4">
            <h1 className="font-serif text-4xl md:text-5xl font-bold" data-testid="text-page-title">
              About <span className="text-primary">Afro AI</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A product of <strong className="text-foreground">KEYO TECHNOLOGIES</strong>, a registered business in the Pearl of Africa, Uganda — and the first AI platform in Africa dedicated to powering startups across the continent.
            </p>
            <p className="text-primary font-serif text-xl italic">"The Africa We Want"</p>
          </div>

          <div className="space-y-12">
            <section className="space-y-4">
              <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
                <Target className="w-6 h-6 text-primary" />
                Our Mission
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Afro AI is a product of KEYO TECHNOLOGIES, a registered business in Uganda (Registration No. 80030812159711), the Pearl of Africa. We are the first AI platform on the continent built specifically to empower African creators. We are breaking down the barriers to technology by providing an AI-powered platform that lets anyone — regardless of technical background — build professional websites and mobile apps.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Our AI assistant understands the unique needs of African businesses and communities. From local restaurants in Lagos to healthcare startups in Nairobi, from fashion brands in Accra to tech companies in Johannesburg — we empower creators across the continent to bring their ideas to life.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
                <Heart className="w-6 h-6 text-primary" />
                Our Values
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-value-africa">Built by Africans for the world</h3>
                    <p className="text-sm text-muted-foreground">We understand the unique challenges and opportunities of the African market. Our platform is designed with Africa-first thinking.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-value-accessibility">Accessibility First</h3>
                    <p className="text-sm text-muted-foreground">Technology should be accessible to everyone. We support 12 African languages and keep our platform affordable for all creators.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-value-quality">Quality Without Compromise</h3>
                    <p className="text-sm text-muted-foreground">Every app and website built on Afro AI meets international standards. We use the latest AI models to generate professional-grade code.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-value-community">Community Driven</h3>
                    <p className="text-sm text-muted-foreground">We grow together. Our platform evolves based on the needs and feedback of the African creator community.</p>
                  </CardContent>
                </Card>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
                <Globe className="w-6 h-6 text-primary" />
                Our Vision
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We envision an Africa where technology creation is democratized — where a student in Kampala can build an app as easily as a developer in Silicon Valley. Where local businesses can establish their digital presence without expensive development teams. Where African innovation leads the global conversation.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Our vision is bold: to power more than <strong className="text-foreground">1 million startups</strong> across Africa and become the <strong className="text-foreground">leading global AI platform by 2062</strong>. We are building "The Africa We Want" — a continent where every dreamer has the tools to build, launch, and scale their ideas.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
                <Users className="w-6 h-6 text-primary" />
                Our Team
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Afro AI is built by KEYO TECHNOLOGIES, founded and led by a passionate team of African technologists, designers, and entrepreneurs who believe in the transformative power of technology. Headquartered in Kampala, Uganda, the Pearl of Africa, our team brings together diverse perspectives and deep understanding of the African tech landscape. As the first AI platform in Africa, we are pioneering the future of technology on the continent.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                What We Offer
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Afro AI is more than just an app builder — it is a complete digital creation suite. Here is everything available on the platform today:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-builder">AI App & Website Builder</h3>
                    <p className="text-sm text-muted-foreground">Describe what you want in plain English, Swahili, Luganda, or any of 12 supported languages. Afro AI builds it — websites, apps, dashboards, games, e-commerce stores, booking systems. Live preview, instant publishing to your own subdomain.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-block-builder">Block Builder</h3>
                    <p className="text-sm text-muted-foreground">A visual page composer with 27 pre-built section blocks (hero, pricing, FAQ, testimonials, team, gallery, contact). Pick, arrange, generate — no coding.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-templates">21 African Templates</h3>
                    <p className="text-sm text-muted-foreground">Pre-built starting points for restaurants, salons, schools, churches, real estate, pharmacies, NGOs, hotels — designed with African businesses in mind.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-domains">Domain Store</h3>
                    <p className="text-sm text-muted-foreground">Buy your own .com, .africa, .co.ug, .co.ke, .com.ng and dozens more — pay with M-Pesa, MTN Mobile Money, Airtel, Visa, Mastercard, or bank transfer.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-afro-auth">Afro Auth</h3>
                    <p className="text-sm text-muted-foreground">Our Login-as-a-Service product for developers. Drop a complete signup, login, and user management system into any app in minutes. Free up to 5,000 monthly users.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-email-api">Email API & Marketing</h3>
                    <p className="text-sm text-muted-foreground">Send transactional emails (order confirmations, password resets) through our hosted Email API. Plus a full email-marketing suite with subscriber lists, campaign builder, and AI-written campaigns.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-chatbots">AI Chatbots</h3>
                    <p className="text-sm text-muted-foreground">Build embeddable AI chatbots for any external website — government portals, businesses, schools. One line of code to embed, custom knowledge base, brand customisation.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-ussd">USSD Builder</h3>
                    <p className="text-sm text-muted-foreground">Build *123# menu applications for millions of feature-phone users across Africa. Perfect for mobile banking, farm price alerts, health hotlines, and education services.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-media">Image & Video Generation</h3>
                    <p className="text-sm text-muted-foreground">Generate stunning images with Google Imagen 3 and short video clips with Veo 2 — all from text prompts, all priced for African creators.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-forms">Forms, Blog & CMS</h3>
                    <p className="text-sm text-muted-foreground">Build forms with any field types and track submissions. Write and publish blog posts. Full content management built in.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-seo">SEO Tools & Analytics</h3>
                    <p className="text-sm text-muted-foreground">Live Google search preview, AI-powered SEO analysis with one-click fixes, server-side analytics that work even with ad blockers.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-integrations">API Integrations & Webhooks</h3>
                    <p className="text-sm text-muted-foreground">Connect any external REST API (WhatsApp Business, payment gateways, CRMs). Register webhooks for form submissions, app views, and marketplace events.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-collaboration">Team Collaboration</h3>
                    <p className="text-sm text-muted-foreground">Invite teammates as Viewers or Editors. Great for agencies managing client projects across the continent.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-marketplace">Marketplace</h3>
                    <p className="text-sm text-muted-foreground">Discover, clone, and publish app templates from the African creator community. Earn visibility for your designs.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-affiliate">Referral & Affiliate Programme</h3>
                    <p className="text-sm text-muted-foreground">Earn 10% commission on every paid upgrade from people you refer. Open to everyone — sign up at afroaigroup.com/affiliate.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-semibold" data-testid="text-offer-dev-console">Dev Console & Shell</h3>
                    <p className="text-sm text-muted-foreground">Professional developer dashboard with real-time activity logs, interactive bash terminal, and deployments overview — all in one place.</p>
                  </CardContent>
                </Card>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
                <Calendar className="w-6 h-6 text-primary" />
                Recent Milestones
              </h2>
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-6 space-y-1">
                    <p className="text-sm font-semibold text-primary">May 2026</p>
                    <p className="text-sm text-muted-foreground">Afro AI now reads the web live — paste any link in chat and the AI fetches and reads the real page content. Upload PDFs, spreadsheets, and documents and the AI extracts and answers questions about them.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-1">
                    <p className="text-sm font-semibold text-primary">May 2026</p>
                    <p className="text-sm text-muted-foreground">Afro Auth launched — our Login-as-a-Service product giving developers a complete user-management system in minutes. Free up to 5,000 monthly users.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-1">
                    <p className="text-sm font-semibold text-primary">May 2026</p>
                    <p className="text-sm text-muted-foreground">Video generation (Veo 2) added for Business-plan users. Image generation upgraded to Imagen 3.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-1">
                    <p className="text-sm font-semibold text-primary">April 2026</p>
                    <p className="text-sm text-muted-foreground">Production deployment moved to a dedicated DigitalOcean droplet with Cloudflare edge caching, automated deploys, snapshot rollback, and 99.9%+ uptime monitoring.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-1">
                    <p className="text-sm font-semibold text-primary">April 2026</p>
                    <p className="text-sm text-muted-foreground">Unified Dev Console launched with real-time activity feed, interactive bash terminal, and deployments overview in one screen.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-1">
                    <p className="text-sm font-semibold text-primary">March 2026</p>
                    <p className="text-sm text-muted-foreground">Email API (transactional sending via AWS SES) and USSD Builder launched as standalone products.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-1">
                    <p className="text-sm font-semibold text-primary">February 2026</p>
                    <p className="text-sm text-muted-foreground">KEYO TECHNOLOGIES officially registered in Kampala, Uganda. Afro AI Domain Store, Block Builder (27 sections), Marketplace, and PWA Builder all launched.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 space-y-1">
                    <p className="text-sm font-semibold text-primary">January 2026</p>
                    <p className="text-sm text-muted-foreground">Platform inception. Core AI builder, project dashboard, 21 African templates, Pesapal payment integration, and Cloudflare Worker authentication (Google, GitHub, email) all shipped.</p>
                  </CardContent>
                </Card>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
                <Building2 className="w-6 h-6 text-primary" />
                Registered Business
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Afro AI is a product of <strong className="text-foreground">KEYO TECHNOLOGIES</strong>, a duly registered business under the Business Names Registration Act of Uganda, Registration No. <strong className="text-foreground">80030812159711</strong>. Registered on the 26th day of February, 2026 in Kampala, Uganda.
              </p>
            </section>

            <div className="text-center pt-8">
              <a href="/login">
                <Button size="lg" data-testid="button-cta-start">
                  Start Building Today
                </Button>
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} KEYO TECHNOLOGIES. All rights reserved. Afro AI — Made with love for Africa.</p>
      </footer>
    </div>
  );
}
