import { useLocation } from "wouter";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  UtensilsCrossed,
  Scissors,
  ShoppingBag,
  Tractor,
  Truck,
  Hotel,
  Shirt,
  Monitor,
  Pizza,
  Palette,
  Camera,
  PenTool,
  Music,
  BookOpen,
  Church,
  GraduationCap,
  Heart,
  Trophy,
  PartyPopper,
  Users,
  CalendarDays,
  ArrowRight,
  Sparkles,
  LayoutTemplate,
} from "lucide-react";

interface Template {
  icon: typeof UtensilsCrossed;
  title: string;
  description: string;
  type: string;
}

interface TemplateCategory {
  name: string;
  templates: Template[];
}

const categories: TemplateCategory[] = [
  {
    name: "Business",
    templates: [
      {
        icon: UtensilsCrossed,
        title: "Restaurant",
        description: "Menu display, online ordering, table reservations, and M-Pesa/MTN MoMo payment integration for African restaurants",
        type: "website",
      },
      {
        icon: Scissors,
        title: "Salon & Barbershop",
        description: "Appointment booking, service pricing, gallery showcase, and WhatsApp contact for beauty and grooming businesses",
        type: "website",
      },
      {
        icon: ShoppingBag,
        title: "Retail Shop",
        description: "Product catalog, inventory display, location map, and mobile money checkout for local shops",
        type: "website",
      },
      {
        icon: Tractor,
        title: "Farm & Agribusiness",
        description: "Produce listings, seasonal pricing, farm-to-market info, and buyer contact forms for agricultural businesses",
        type: "website",
      },
      {
        icon: Truck,
        title: "Transport & Logistics",
        description: "Route information, fare calculator, booking system, and fleet showcase for matatu, boda-boda, or logistics companies",
        type: "website",
      },
      {
        icon: Hotel,
        title: "Hotel & Guesthouse",
        description: "Room gallery, availability calendar, pricing in local currency, and direct booking with mobile money payments",
        type: "website",
      },
    ],
  },
  {
    name: "E-Commerce",
    templates: [
      {
        icon: Shirt,
        title: "Fashion Store",
        description: "Clothing catalog with sizes, lookbook gallery, shopping cart, and M-Pesa checkout for African fashion brands",
        type: "website",
      },
      {
        icon: Monitor,
        title: "Electronics Shop",
        description: "Product specs, comparison features, installment pricing, and mobile money payment for tech retailers",
        type: "website",
      },
      {
        icon: Pizza,
        title: "Food Delivery",
        description: "Menu with categories, delivery zones, order tracking, and mobile payment for food delivery services",
        type: "website",
      },
      {
        icon: Palette,
        title: "Crafts & Art Market",
        description: "Handmade products showcase, artist profiles, custom order requests, and international shipping info for African artisans",
        type: "website",
      },
    ],
  },
  {
    name: "Portfolio",
    templates: [
      {
        icon: Camera,
        title: "Photography",
        description: "Photo gallery, booking calendar, package pricing, and client testimonials for African photographers",
        type: "website",
      },
      {
        icon: PenTool,
        title: "Design Studio",
        description: "Project showcase, design process overview, client list, and inquiry form for graphic and web designers",
        type: "website",
      },
      {
        icon: Music,
        title: "Music Artist",
        description: "Discography, event dates, music player, social media links, and booking contact for musicians and DJs",
        type: "website",
      },
      {
        icon: BookOpen,
        title: "Writer & Blogger",
        description: "Published works, blog posts, author bio, and newsletter signup for writers and content creators",
        type: "website",
      },
    ],
  },
  {
    name: "Community",
    templates: [
      {
        icon: Church,
        title: "Church & Ministry",
        description: "Service schedule, sermon archive, donation portal with mobile money, and event announcements for places of worship",
        type: "website",
      },
      {
        icon: GraduationCap,
        title: "School & Academy",
        description: "Course catalog, admission info, fee structure, timetable, and parent portal for educational institutions",
        type: "website",
      },
      {
        icon: Heart,
        title: "NGO & Charity",
        description: "Mission overview, impact reports, volunteer signup, and donation integration for non-profit organizations",
        type: "website",
      },
      {
        icon: Trophy,
        title: "Sports Club",
        description: "Team roster, match schedule, results, membership registration, and photo gallery for sports organizations",
        type: "website",
      },
    ],
  },
  {
    name: "Events",
    templates: [
      {
        icon: PartyPopper,
        title: "Wedding",
        description: "RSVP management, venue details, photo gallery, gift registry, and countdown timer for wedding celebrations",
        type: "website",
      },
      {
        icon: Users,
        title: "Conference & Summit",
        description: "Speaker lineup, agenda, ticket sales with mobile money, venue info, and sponsor showcase for professional events",
        type: "website",
      },
      {
        icon: CalendarDays,
        title: "Festival & Concert",
        description: "Artist lineup, ticket tiers, venue map, schedule, and social sharing for music festivals and cultural events",
        type: "website",
      },
    ],
  },
];

export default function TemplatesPage() {
  const [, navigate] = useLocation();
  const { t } = useLanguage();

  const handleUseTemplate = (template: Template) => {
    const prompt = `Build a ${template.title.toLowerCase()} website: ${template.description}`;
    navigate(
      `/chat?project=${encodeURIComponent(template.title)}&type=${template.type}&description=${encodeURIComponent(prompt)}`
    );
  };

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <LayoutTemplate className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-templates-heading">
                Templates
              </h1>
              <p className="text-sm text-muted-foreground">
                Choose a template to quickly start building your African business website
              </p>
            </div>
          </div>
        </div>

        {categories.map((category) => (
          <div key={category.name} className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold" data-testid={`text-category-${category.name.toLowerCase()}`}>
                {category.name}
              </h2>
              <Badge variant="secondary">
                {category.templates.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {category.templates.map((template) => (
                <Card
                  key={template.title}
                  className="hover-elevate group cursor-pointer"
                  onClick={() => handleUseTemplate(template)}
                  data-testid={`card-template-${template.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <template.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-sm" data-testid={`text-template-title-${template.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          {template.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {template.description}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUseTemplate(template);
                      }}
                      data-testid={`button-use-template-${template.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Use Template
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
