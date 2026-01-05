import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Wrench,
  Droplets,
  Pipette,
  Flame,
  Settings,
  Bath,
  ArrowRight,
  FileText,
  Building,
  Calculator,
  TrendingUp,
  Shield,
  Briefcase,
  Thermometer,
  Wind,
  Home,
  Zap,
  Activity,
  HeartPulse,
  Baby,
  Dumbbell,
  Leaf,
  Sparkles,
  Trash2,
  Warehouse,
  Headphones,
  Server,
  Cloud,
  Database,
  Network,
  type LucideIcon,
} from "lucide-react";

interface ServicesProps {
  servicesSection: {
    tagline: string;
    headline: string;
    subheadline: string;
    services: {
      icon: string;
      title: string;
      description: string;
    }[];
  };
}

const iconMap: Record<string, LucideIcon> = {
  Wrench,
  Droplets,
  PipetteIcon: Pipette,
  Pipette,
  Flame,
  Settings,
  Bath,
  FileText,
  Building,
  Calculator,
  TrendingUp,
  Shield,
  Briefcase,
  Thermometer,
  Wind,
  Home,
  Zap,
  Activity,
  HeartPulse,
  Baby,
  Dumbbell,
  Leaf,
  Sparkles,
  Trash2,
  Warehouse,
  Headphones,
  Server,
  Cloud,
  Database,
  Network,
};

export function Services({ servicesSection }: ServicesProps) {
  return (
    <section id="services" className="py-20 bg-gray-section">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-block text-accent font-semibold mb-2">
            {servicesSection.tagline}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {servicesSection.headline}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {servicesSection.subheadline}
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {servicesSection.services.map((service, index) => {
            const Icon = iconMap[service.icon] || Wrench;
            return (
              <Card
                key={service.title}
                className="group cursor-pointer border-transparent hover:border-accent/20 bg-card animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <CardHeader>
                  <div className="w-14 h-14 bg-accent/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                    <Icon className="h-7 w-7 text-accent" />
                  </div>
                  <CardTitle className="group-hover:text-accent transition-colors">
                    {service.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-base">
                    {service.description}
                  </p>
                  <a
                    href="#contact"
                    className="inline-flex items-center gap-1 text-accent font-medium mt-4 group-hover:gap-2 transition-all"
                  >
                    Learn More
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

