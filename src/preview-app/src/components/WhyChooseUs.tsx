import {
  Clock,
  Shield,
  Zap,
  Award,
  DollarSign,
  ThumbsUp,
  Users,
  Lock,
  Heart,
  CreditCard,
  MapPin,
  Star,
  CheckCircle,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

interface WhyChooseUsProps {
  whyChooseUs: {
    tagline: string;
    headline: string;
    benefits: {
      icon: string;
      title: string;
      description: string;
    }[];
  };
}

const iconMap: Record<string, LucideIcon> = {
  Clock,
  Shield,
  Zap,
  Award,
  DollarSign,
  ThumbsUp,
  Users,
  Lock,
  Heart,
  CreditCard,
  MapPin,
  Star,
  CheckCircle,
  TrendingUp,
};

export function WhyChooseUs({ whyChooseUs }: WhyChooseUsProps) {
  return (
    <section className="py-20 bg-card">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-block text-accent font-semibold mb-2">
            {whyChooseUs.tagline}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {whyChooseUs.headline}
          </h2>
        </div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {whyChooseUs.benefits.map((benefit, index) => {
            const Icon = iconMap[benefit.icon] || Shield;
            return (
              <div
                key={benefit.title}
                className="text-center animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Icon className="h-8 w-8 text-accent" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {benefit.title}
                </h3>
                <p className="text-muted-foreground">
                  {benefit.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

