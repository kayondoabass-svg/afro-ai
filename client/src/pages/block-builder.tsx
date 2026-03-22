import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Layers, Plus, X, ChevronUp, ChevronDown, Wand2, Copy, ArrowRight,
  Monitor, Zap, MessageSquare, Star, DollarSign, Image, Mail, Users,
  BarChart2, Map, ShoppingBag, Play, BookOpen, Trophy, Phone, Grid
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Block {
  id: string;
  name: string;
  category: string;
  icon: any;
  description: string;
  prompt: string;
}

const BLOCK_LIBRARY: Block[] = [
  // Hero
  { id: "hero-classic", name: "Classic Hero", category: "Hero", icon: Monitor, description: "Full-width headline, subtitle, and two CTA buttons", prompt: "a full-width hero section with a bold headline, subtitle text, and two call-to-action buttons (primary and secondary)" },
  { id: "hero-split", name: "Split Hero", category: "Hero", icon: Layers, description: "Text on left, image/illustration on right", prompt: "a split-screen hero section with compelling text on the left and a visual/illustration on the right" },
  { id: "hero-video", name: "Video Hero", category: "Hero", icon: Play, description: "Background video with overlay text and CTA", prompt: "a video background hero section with dark overlay, large headline, and a glowing CTA button" },
  { id: "hero-minimal", name: "Minimal Hero", category: "Hero", icon: Zap, description: "Clean, centered text with subtle background", prompt: "a minimal centered hero section with elegant typography, a short tagline, and a single CTA" },
  // Features
  { id: "features-grid", name: "Features Grid", category: "Features", icon: Grid, description: "3-column grid of feature cards with icons", prompt: "a 3-column features grid with icon cards, each featuring a heading and short description" },
  { id: "features-list", name: "Features List", category: "Features", icon: Layers, description: "Alternating text/image feature highlights", prompt: "alternating left-right feature highlight sections each with an icon, heading, description, and decorative visual" },
  { id: "features-tabs", name: "Feature Tabs", category: "Features", icon: BookOpen, description: "Tabbed interface showcasing different features", prompt: "a tabbed features section with 4 tabs, each revealing a feature description with an icon and screenshot placeholder" },
  // Social Proof
  { id: "testimonials", name: "Testimonials", category: "Social Proof", icon: MessageSquare, description: "Customer review cards with avatars and ratings", prompt: "a testimonials section with 3 customer review cards, each with an avatar, name, star rating, and quote" },
  { id: "stats-counter", name: "Stats Counter", category: "Social Proof", icon: BarChart2, description: "Animated number counters for key metrics", prompt: "an animated statistics counter section showing 4 key metrics with large numbers and descriptive labels" },
  { id: "trust-badges", name: "Trust Badges", category: "Social Proof", icon: Trophy, description: "Logos, certifications, and trust signals", prompt: "a trust signals section with partner logos, certification badges, and award mentions" },
  { id: "team-grid", name: "Team Grid", category: "Social Proof", icon: Users, description: "Team member cards with photos and roles", prompt: "a team section with profile cards showing member photos, names, roles, and social links" },
  // Pricing
  { id: "pricing-cards", name: "Pricing Cards", category: "Pricing", icon: DollarSign, description: "3-tier pricing with highlighted popular plan", prompt: "a 3-column pricing section with Starter, Pro, and Business plans — highlight the Pro plan as 'Most Popular' with a gold border" },
  { id: "pricing-table", name: "Pricing Table", category: "Pricing", icon: Grid, description: "Feature comparison table across tiers", prompt: "a detailed pricing comparison table showing features across 3 tiers with checkmarks and X marks" },
  // Media
  { id: "gallery-grid", name: "Photo Gallery", category: "Media", icon: Image, description: "Masonry or grid photo gallery with lightbox", prompt: "a responsive photo gallery section with a grid/masonry layout and hover zoom effects" },
  { id: "video-section", name: "Video Section", category: "Media", icon: Play, description: "Embedded video with supporting text", prompt: "a video showcase section with a centered embedded video player, title, and supporting description text" },
  // CTA
  { id: "cta-banner", name: "CTA Banner", category: "CTA", icon: Zap, description: "Full-width call-to-action with bold text and button", prompt: "a full-width CTA banner section with a bold headline, supporting text, and a prominent button" },
  { id: "newsletter", name: "Newsletter Signup", category: "CTA", icon: Mail, description: "Email capture form with value proposition", prompt: "a newsletter signup section with an email input form, a compelling headline about what subscribers get, and a subscribe button" },
  { id: "contact-form", name: "Contact Form", category: "CTA", icon: Phone, description: "Full contact form with name, email, message", prompt: "a contact section with a form (name, email, phone, message), contact details, and a map placeholder" },
  // E-Commerce
  { id: "product-grid", name: "Product Grid", category: "Shop", icon: ShoppingBag, description: "Product cards with price, image, and buy button", prompt: "a product catalog section with 6 product cards each showing an image, name, price, and an 'Add to Cart' button" },
  { id: "cart-section", name: "Shopping Cart", category: "Shop", icon: ShoppingBag, description: "Cart summary with items and checkout", prompt: "a shopping cart section with a list of cart items (image, name, quantity, price), subtotal, and a checkout button" },
  // Navigation & Footer
  { id: "about-section", name: "About Us", category: "Content", icon: BookOpen, description: "Company story, mission, and values", prompt: "an about us section with company story, mission statement, core values with icons, and a timeline of milestones" },
  { id: "faq", name: "FAQ Accordion", category: "Content", icon: MessageSquare, description: "Expandable FAQ questions and answers", prompt: "a FAQ section with 6 accordion-style expandable questions and answers" },
  { id: "location-map", name: "Location Map", category: "Content", icon: Map, description: "Address, hours, and embedded map", prompt: "a location section with business address, opening hours, phone number, and a Google Maps embed placeholder" },
  { id: "footer-simple", name: "Simple Footer", category: "Footer", icon: Layers, description: "Clean footer with links and copyright", prompt: "a clean footer with logo, navigation links, social media icons, and copyright notice" },
  { id: "footer-full", name: "Full Footer", category: "Footer", icon: Grid, description: "Multi-column footer with links, newsletter, and info", prompt: "a comprehensive multi-column footer with logo column, quick links, services, contact info, newsletter signup, and social icons" },
  { id: "blog-grid", name: "Blog Grid", category: "Content", icon: BookOpen, description: "Latest posts grid with thumbnails and dates", prompt: "a blog/news section with 3 article cards showing thumbnail, category badge, title, excerpt, date, and 'Read More' link" },
  { id: "star-rating", name: "Reviews Section", category: "Social Proof", icon: Star, description: "Star ratings with written reviews", prompt: "a reviews section with overall star rating, rating breakdown bars, and individual written reviews" },
];

const CATEGORIES = ["All", "Hero", "Features", "Social Proof", "Pricing", "Media", "Shop", "CTA", "Content", "Footer"];

const STYLES = ["Modern & Minimal", "Bold African", "Corporate", "Creative & Colorful", "Dark & Elegant", "Warm & Friendly"];
const COLOR_THEMES = ["Gold & Black (Afro AI)", "Blue & White", "Green & Earthy", "Purple & Midnight", "Red & Bold", "Teal & Fresh"];

export default function BlockBuilderPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [composition, setComposition] = useState<Block[]>([]);
  const [appName, setAppName] = useState("");
  const [appStyle, setAppStyle] = useState(STYLES[0]);
  const [colorTheme, setColorTheme] = useState(COLOR_THEMES[0]);

  const filteredBlocks = selectedCategory === "All"
    ? BLOCK_LIBRARY
    : BLOCK_LIBRARY.filter(b => b.category === selectedCategory);

  const addBlock = (block: Block) => {
    if (composition.find(b => b.id === block.id)) {
      toast({ title: "Already added", description: `${block.name} is already in your page.` });
      return;
    }
    setComposition(prev => [...prev, block]);
  };

  const removeBlock = (id: string) => setComposition(prev => prev.filter(b => b.id !== id));

  const moveBlock = (idx: number, dir: "up" | "down") => {
    setComposition(prev => {
      const arr = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= arr.length) return arr;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return arr;
    });
  };

  const buildPrompt = () => {
    const name = appName || "My Website";
    const sections = composition.map((b, i) => `${i + 1}. ${b.prompt}`).join("\n");
    return `Build me a complete website called "${name}". Style: ${appStyle}. Color theme: ${colorTheme}.\n\nInclude these sections in this exact order:\n${sections}\n\nMake it stunning, fully responsive, and mobile-friendly. Use the glassmorphism card style on all cards. Include smooth scroll and all navigation links working.`;
  };

  const generateWithAI = () => {
    if (composition.length === 0) {
      toast({ title: "Add some blocks first", description: "Pick at least 2 sections to build your page.", variant: "destructive" });
      return;
    }
    const prompt = buildPrompt();
    sessionStorage.setItem("builder_prompt", prompt);
    setLocation("/chat?from=builder");
    toast({ title: "Opening AI builder...", description: "Your page blueprint has been sent to the AI." });
  };

  const copyPrompt = () => {
    if (composition.length === 0) return;
    navigator.clipboard.writeText(buildPrompt());
    toast({ title: "Prompt copied!", description: "Paste it into the AI chat to generate your page." });
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Block Library */}
      <div className="w-80 min-w-[280px] border-r bg-background flex flex-col overflow-hidden">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-sm">Block Library</h2>
            <Badge variant="secondary" className="ml-auto text-xs">{BLOCK_LIBRARY.length} blocks</Badge>
          </div>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                data-testid={`button-category-${cat.toLowerCase()}`}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${selectedCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 hover:text-primary"}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredBlocks.map(block => {
            const Icon = block.icon;
            const added = composition.some(b => b.id === block.id);
            return (
              <div
                key={block.id}
                data-testid={`block-${block.id}`}
                className={`group flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${added ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/50"}`}
                onClick={() => addBlock(block)}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${added ? "bg-primary/20" : "bg-muted"}`}>
                  <Icon className={`w-4 h-4 ${added ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold truncate">{block.name}</p>
                    {added && <Badge className="text-[9px] px-1 py-0 h-3.5" variant="default">Added</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{block.description}</p>
                </div>
                <Plus className={`w-3.5 h-3.5 flex-shrink-0 mt-1 transition-opacity ${added ? "opacity-0" : "opacity-0 group-hover:opacity-60"}`} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Composition Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Controls */}
        <div className="border-b p-4 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Monitor className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="App / Website name..."
                value={appName}
                onChange={e => setAppName(e.target.value)}
                className="h-8 text-sm"
                data-testid="input-app-name"
              />
            </div>
            <Select value={appStyle} onValueChange={setAppStyle}>
              <SelectTrigger className="h-8 w-[180px] text-xs" data-testid="select-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={colorTheme} onValueChange={setColorTheme}>
              <SelectTrigger className="h-8 w-[200px] text-xs" data-testid="select-color">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_THEMES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2 ml-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={copyPrompt} disabled={composition.length === 0} data-testid="button-copy-prompt">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy AI prompt</TooltipContent>
              </Tooltip>
              <Button size="sm" onClick={generateWithAI} disabled={composition.length === 0} className="gap-2" data-testid="button-generate">
                <Wand2 className="w-3.5 h-3.5" />
                Generate with AI
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Composition Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {composition.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Layers className="w-8 h-8 text-primary/60" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Start Building Your Page</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Pick sections from the block library on the left. They'll appear here in order — drag to rearrange, then hit Generate to bring them to life with AI.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {["Classic Hero", "Features Grid", "Testimonials", "Pricing Cards", "Simple Footer"].map(name => (
                  <Badge
                    key={name}
                    variant="outline"
                    className="cursor-pointer hover:border-primary/60 hover:text-primary text-xs"
                    onClick={() => { const b = BLOCK_LIBRARY.find(bl => bl.name === name); if (b) addBlock(b); }}
                  >
                    + {name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Page Structure</h3>
                <Badge variant="secondary">{composition.length} section{composition.length !== 1 ? "s" : ""}</Badge>
              </div>
              {composition.map((block, idx) => {
                const Icon = block.icon;
                return (
                  <Card key={block.id} data-testid={`composition-block-${block.id}`} className="border-primary/20 hover:border-primary/40 transition-colors">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveBlock(idx, "up")} disabled={idx === 0} className="p-0.5 rounded hover:bg-accent disabled:opacity-30" data-testid={`button-move-up-${idx}`}>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => moveBlock(idx, "down")} disabled={idx === composition.length - 1} className="p-0.5 rounded hover:bg-accent disabled:opacity-30" data-testid={`button-move-down-${idx}`}>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                            <p className="text-sm font-medium">{block.name}</p>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{block.category}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{block.description}</p>
                        </div>
                        <button onClick={() => removeBlock(block.id)} className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors" data-testid={`button-remove-${block.id}`}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <div className="pt-4 flex justify-center">
                <Button onClick={generateWithAI} size="lg" className="gap-2 px-8 shadow-lg shadow-primary/20" data-testid="button-generate-bottom">
                  <Wand2 className="w-4 h-4" />
                  Generate {appName || "My Page"} with AI
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
