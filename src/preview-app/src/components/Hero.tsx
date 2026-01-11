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
  phone: string;
}

const badgeIcons: Record<string, typeof Clock> = {
  "Available 24/7": Clock,
  "Licensed & Insured": Shield,
  "Same-Day Service": Zap,
};

export function Hero({ hero, heroImage, rating, phone }: HeroProps) {
  const phoneDigits = phone.replace(/\D/g, "");
  const telUrl = `tel:${phoneDigits}`;
  
  // Check if we have a real hero image (not placeholder)
  const hasRealImage = heroImage && !heroImage.includes('placeholder');
  
  // Handle phone click to work in iframes on iOS
  const handlePhoneClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.open(telUrl, '_top');
  };

  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Background - Image with overlay OR thematic gradient */}
      {hasRealImage ? (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-navy-dark/95 via-navy/90 to-navy-dark/80" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-navy-dark via-navy to-navy-dark">
          {/* Subtle pattern overlay for visual interest */}
          <div 
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          {/* Gradient accent glow */}
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
        </div>
      )}

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
              5-Star Rated on Google
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
            <a href={telUrl} onClick={handlePhoneClick}>
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

