import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { useLanguage } from "@/hooks/use-language";
import { ArrowLeft, Users, Target, Heart, Globe } from "lucide-react";
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
              A registered business in the Pearl of Africa, Uganda — and the first AI platform in Africa dedicated to powering startups across the continent.
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
                Afro AI is a registered business in Uganda, the Pearl of Africa, and the first AI platform on the continent built specifically to empower African creators. We are breaking down the barriers to technology by providing an AI-powered platform that lets anyone — regardless of technical background — build professional websites and mobile apps.
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
                    <h3 className="font-semibold" data-testid="text-value-africa">Built for Africa, by Africans</h3>
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
                Afro AI is founded and led by a passionate team of African technologists, designers, and entrepreneurs who believe in the transformative power of technology. Headquartered in Uganda, the Pearl of Africa, our team brings together diverse perspectives and deep understanding of the African tech landscape. As the first AI platform in Africa, we are pioneering the future of technology on the continent.
              </p>
            </section>

            <div className="text-center pt-8">
              <a href="/api/login">
                <Button size="lg" data-testid="button-cta-start">
                  Start Building Today
                </Button>
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Afro AI. All rights reserved. Made with love for Africa.</p>
      </footer>
    </div>
  );
}
