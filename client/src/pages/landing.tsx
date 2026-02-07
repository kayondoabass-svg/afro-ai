import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Smartphone,
  Globe,
  Sparkles,
  MessageSquare,
  Rocket,
  Shield,
  ArrowRight,
  Zap,
  Code2,
  Store,
  Check,
} from "lucide-react";
import heroBg from "@assets/hero-bg.png";
import workspaceImg from "@assets/workspace.png";
import africaTechImg from "@assets/africa-tech.png";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight" data-testid="text-logo">Africa.ai</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground transition-colors" data-testid="link-features">Features</a>
            <a href="#pricing" className="text-sm text-muted-foreground transition-colors" data-testid="link-pricing">Pricing</a>
            <a href="#about" className="text-sm text-muted-foreground transition-colors" data-testid="link-about">About</a>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/api/login">
              <Button variant="ghost" data-testid="button-login">Log In</Button>
            </a>
            <a href="/api/login">
              <Button data-testid="button-get-started">Get Started</Button>
            </a>
          </div>
        </div>
      </nav>

      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBg}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-background" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36 lg:py-44">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-8">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 backdrop-blur-sm">
                <Zap className="w-3 h-3 mr-1" />
                Built for Africa, by Africa
              </Badge>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-white">
                The Future
                <span className="text-primary block mt-1">We Build</span>
              </h1>

              <p className="text-lg text-gray-300 max-w-lg leading-relaxed">
                Create stunning websites and powerful mobile apps. Launch them to the App Store and Google Play Store. All powered by AI, designed for African innovators.
              </p>

              <div className="flex flex-wrap gap-3">
                <a href="/api/login">
                  <Button size="lg" data-testid="button-hero-start">
                    Start Creating
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
                <a href="#features">
                  <Button size="lg" variant="outline" className="backdrop-blur-sm bg-white/5 text-white border-white/20" data-testid="button-hero-learn">
                    See How It Works
                  </Button>
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Check className="w-4 h-4 text-primary" />
                  <span>Free to start</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Check className="w-4 h-4 text-primary" />
                  <span>AI-powered</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Check className="w-4 h-4 text-primary" />
                  <span>No code needed</span>
                </div>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="relative animate-float">
                <div className="absolute -inset-4 bg-primary/20 rounded-2xl blur-3xl animate-glow-pulse" />
                <img
                  src={workspaceImg}
                  alt="Africa.ai workspace"
                  className="relative rounded-2xl ring-1 ring-white/10"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-4">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Empowering African Innovation
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl font-bold text-primary" data-testid="text-stat-creators">10K+</p>
              <p className="text-sm text-muted-foreground mt-1">African Creators</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary" data-testid="text-stat-apps">5K+</p>
              <p className="text-sm text-muted-foreground mt-1">Apps Launched</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary" data-testid="text-stat-countries">54</p>
              <p className="text-sm text-muted-foreground mt-1">Countries</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary" data-testid="text-stat-uptime">99.9%</p>
              <p className="text-sm text-muted-foreground mt-1">Uptime</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              <Sparkles className="w-3 h-3 mr-1" />
              Features
            </Badge>
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
              Everything You Need to
              <span className="text-primary"> Build & Launch</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From idea to App Store. Design, build, and deploy professional websites and mobile apps with the power of AI.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="hover-elevate group">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold" data-testid="text-feature-websites">Website Builder</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Create beautiful, responsive websites with our drag-and-drop builder. No coding experience required.
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate group">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold" data-testid="text-feature-apps">App Designer</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Design mobile apps for iOS and Android. Preview in real-time and publish directly to app stores.
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate group">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold" data-testid="text-feature-ai">AI Chat Assistant</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Get instant help from our AI assistant. Ask questions, get code suggestions, and solve problems in real-time.
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate group">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                  <Store className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold" data-testid="text-feature-store">App Store Launch</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Publish to Apple App Store and Google Play Store with one click. We handle all the complexity.
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate group">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                  <Code2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold" data-testid="text-feature-code">Code Generation</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  AI generates clean, production-ready code. Export your project or let us host it for you.
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate group">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold" data-testid="text-feature-security">Secure & Reliable</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Enterprise-grade security and 99.9% uptime. Your apps are safe, fast, and always available.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <img
                src={africaTechImg}
                alt="Africa connected through technology"
                className="rounded-2xl ring-1 ring-border max-w-sm mx-auto lg:mx-0"
              />
            </div>
            <div className="space-y-6">
              <h2 className="font-serif text-3xl md:text-4xl font-bold">
                Africa Rising.
                <span className="text-primary block mt-1">Innovation Without Limits.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Africa is home to the world's youngest and fastest-growing population. With Africa.ai, every dreamer, entrepreneur, and creator can turn their vision into reality. Build the apps that will transform communities, create opportunities, and shape the digital future of the continent.
              </p>
              <div className="space-y-3">
                {[
                  "Ubuntu-inspired collaboration tools",
                  "Mobile-first design for African networks",
                  "Local payment integration with Flutterwave",
                  "Multilingual support for African languages",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              <Rocket className="w-3 h-3 mr-1" />
              Pricing
            </Badge>
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
              Fair Pricing for
              <span className="text-primary"> Every Creator</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Affordable plans designed for African innovators. Start free, scale as you grow.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">Starter</h3>
                  <p className="text-sm text-muted-foreground mt-1">Perfect to get started</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">Free</span>
                </div>
                <div className="space-y-3">
                  {["1 project", "Basic AI chat", "Community support", "Africa.ai subdomain"].map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
                <a href="/api/login" className="block">
                  <Button variant="outline" className="w-full" data-testid="button-plan-starter">Get Started</Button>
                </a>
              </CardContent>
            </Card>

            <Card className="hover-elevate ring-2 ring-primary relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
              </div>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">Pro</h3>
                  <p className="text-sm text-muted-foreground mt-1">For serious creators</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$9</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <div className="space-y-3">
                  {["10 projects", "Unlimited AI chat", "Priority support", "Custom domain", "App Store publishing"].map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
                <Button className="w-full" disabled data-testid="button-plan-pro">
                  Coming Soon
                </Button>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">Business</h3>
                  <p className="text-sm text-muted-foreground mt-1">For teams & agencies</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$29</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <div className="space-y-3">
                  {["Unlimited projects", "Advanced AI features", "Dedicated support", "White-label apps", "Team collaboration", "Analytics dashboard"].map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full" disabled data-testid="button-plan-business">
                  Coming Soon
                </Button>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Payments powered by Flutterwave. Pay with Mobile Money, cards, or bank transfer.
          </p>
        </div>
      </section>

      <section id="about" className="py-20 bg-card/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <h2 className="font-serif text-3xl md:text-4xl font-bold">
            "If you want to go fast, go alone.
            <span className="text-primary block mt-2">If you want to go far, go together."</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            An African proverb that guides everything we build. Africa.ai is more than a tool — it's a movement to empower every African creator to build the technology that shapes our continent's future.
          </p>
          <a href="/api/login">
            <Button size="lg" className="mt-4" data-testid="button-join-movement">
              Join the Movement
              <ArrowRight className="w-4 h-4" />
            </Button>
          </a>
        </div>
      </section>

      <footer className="border-t py-12 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-bold">Africa.ai</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Building the future of African technology, one app at a time.
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Product</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Website Builder</p>
                <p>App Designer</p>
                <p>AI Assistant</p>
                <p>App Store Launch</p>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Company</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>About Us</p>
                <p>Careers</p>
                <p>Blog</p>
                <p>Contact</p>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Legal</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Privacy Policy</p>
                <p>Terms of Service</p>
                <p>Cookie Policy</p>
              </div>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} Africa.ai. All rights reserved. Made with love for Africa.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
