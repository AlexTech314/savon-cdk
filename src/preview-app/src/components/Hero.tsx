import { Button } from "@/components/ui/button";
import { Phone, Star, Clock, Shield, Zap } from "lucide-react";

interface HeroProps {
  hero: {
    headline: string;
    subheadline: string;
    primaryCta: string;
    secondaryCta: string;
    trustBadges: string[];
  };
  heroImage: string;
  rating: number;
  ratingCount: number;
  phone: string;
}

const badgeIcons: Record<string, typeof Clock> = {
  "Available 24/7": Clock,
  "Licensed & Insured": Shield,
  "Same-Day Service": Zap,
};

export function Hero({ hero, heroImage, rating, ratingCount, phone }: HeroProps) {
  const phoneDigits = phone.replace(/\D/g, "");

  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-navy-dark/95 via-navy/90 to-navy-dark/80" />
      </div>

      {/* Content */}
      <div className="relative container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-3xl">
          {/* Rating Badge */}
          <div className="inline-flex items-center gap-2 bg-card/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full px-4 py-2 mb-6 animate-fade-in">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${
                    i < Math.round(rating)
                      ? "fill-accent text-accent"
                      : "text-accent/30"
                  }`}
                />
              ))}
            </div>
            <span className="text-primary-foreground font-semibold">
              {rating}/5 Stars
            </span>
            <span className="text-primary-foreground/80">•</span>
            <span className="text-primary-foreground/80">
              {ratingCount}+ Happy Customers
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-6 leading-tight animate-fade-in"
            style={{ animationDelay: "0.1s" }}
          >
            {hero.headline}
          </h1>

          {/* Subheadline */}
          <p
            className="text-xl md:text-2xl text-primary-foreground/90 mb-8 max-w-2xl animate-fade-in"
            style={{ animationDelay: "0.2s" }}
          >
            {hero.subheadline}
          </p>

          {/* CTA Buttons */}
          <div
            className="flex flex-col sm:flex-row gap-4 mb-10 animate-fade-in"
            style={{ animationDelay: "0.3s" }}
          >
            <a href={`tel:${phoneDigits}`}>
              <Button size="lg" className="w-full sm:w-auto gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
                <Phone className="h-5 w-5" />
                {hero.primaryCta}
              </Button>
            </a>
            <a href="#contact">
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto border-2 border-primary-foreground/60 bg-transparent text-primary-foreground hover:bg-primary-foreground hover:text-navy-dark"
              >
                {hero.secondaryCta}
              </Button>
            </a>
          </div>

          {/* Trust Badges */}
          <div
            className="flex flex-wrap gap-4 animate-fade-in"
            style={{ animationDelay: "0.4s" }}
          >
            {hero.trustBadges.map((badge) => {
              const Icon = badgeIcons[badge] || Shield;
              return (
                <div
                  key={badge}
                  className="flex items-center gap-2 bg-card/10 backdrop-blur-sm rounded-lg px-4 py-2"
                >
                  <Icon className="h-5 w-5 text-accent" />
                  <span className="text-primary-foreground text-sm font-medium">
                    {badge}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce-slow">
        <div className="w-6 h-10 border-2 border-primary-foreground/30 rounded-full flex justify-center pt-2">
          <div className="w-1 h-3 bg-primary-foreground/50 rounded-full" />
        </div>
      </div>
    </section>
  );
}

