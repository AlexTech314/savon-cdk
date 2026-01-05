import { Phone, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmergencyCtaProps {
  emergencyCta: {
    headline: string;
    subheadline: string;
    ctaText: string;
  };
  phone: string;
}

export function EmergencyCTA({ emergencyCta, phone }: EmergencyCtaProps) {
  const phoneDigits = phone.replace(/\D/g, "");

  return (
    <section className="py-16 bg-accent">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4 text-center md:text-left">
            <div className="hidden md:flex w-16 h-16 bg-accent-foreground/20 rounded-full items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-8 w-8 text-accent-foreground" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-accent-foreground mb-2">
                {emergencyCta.headline}
              </h2>
              <p className="text-accent-foreground/90 max-w-xl">
                {emergencyCta.subheadline}
              </p>
            </div>
          </div>

          <a href={`tel:${phoneDigits}`}>
            <Button
              size="lg"
              className="gap-2 bg-accent-foreground text-accent hover:bg-accent-foreground/90 shadow-prominent"
            >
              <Phone className="h-5 w-5" />
              {emergencyCta.ctaText}
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}

