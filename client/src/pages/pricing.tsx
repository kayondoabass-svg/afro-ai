import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Rocket, Sparkles } from "lucide-react";

export default function PricingPage() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="text-center space-y-4">
          <Badge variant="outline" className="mx-auto">
            <Rocket className="w-3 h-3 mr-1" />
            Pricing
          </Badge>
          <h1 className="text-3xl font-bold font-serif" data-testid="text-pricing-title">
            Choose Your Plan
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Affordable plans built for African creators. Start free, scale as you grow. Payments powered by Flutterwave.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
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
              <Button variant="secondary" className="w-full" data-testid="button-current-plan">
                Current Plan
              </Button>
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
                {["10 projects", "Unlimited AI chat", "Priority support", "Custom domain", "App Store publishing", "Advanced templates"].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full" disabled data-testid="button-pro-plan">
                <Sparkles className="w-4 h-4" />
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
                {["Unlimited projects", "Advanced AI features", "Dedicated support", "White-label apps", "Team collaboration", "Analytics dashboard", "API access"].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full" disabled data-testid="button-business-plan">
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Flutterwave Payments Coming Soon</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              We're integrating Flutterwave to accept Mobile Money, Visa, Mastercard, and bank transfers across Uganda and all of Africa. Stay tuned!
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
