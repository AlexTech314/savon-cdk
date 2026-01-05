import { Phone, MapPin, Clock, Shield, Award, CheckCircle } from "lucide-react";

interface ContactProps {
  contactSection: {
    tagline: string;
    headline: string;
    trustBadges: string[];
    servingNote: string;
  };
  businessName: string;
  phone: string;
  address: string;
  hoursDisplay: string;
}

const badgeIcons = [Shield, Award, CheckCircle, CheckCircle, CheckCircle];

export function Contact({
  contactSection,
  businessName,
  phone,
  address,
  hoursDisplay,
}: ContactProps) {
  const phoneDigits = phone.replace(/\D/g, "");

  return (
    <section id="contact" className="py-20 bg-card">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Contact Info */}
          <div>
            <span className="inline-block text-accent font-semibold mb-2">
              {contactSection.tagline}
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
              {contactSection.headline || businessName}
            </h2>

            <div className="space-y-6">
              {/* Phone */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Phone className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Phone</h3>
                  <a
                    href={`tel:${phoneDigits}`}
                    className="text-accent hover:text-accent/80 transition-colors text-xl font-bold"
                  >
                    {phone}
                  </a>
                </div>
              </div>

              {/* Address */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Address</h3>
                  <p className="text-muted-foreground">{address}</p>
                </div>
              </div>

              {/* Hours */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Hours</h3>
                  <p className="text-muted-foreground">{hoursDisplay}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="bg-gray-section rounded-2xl p-8">
            <h3 className="text-xl font-bold text-foreground mb-6">
              Your Trusted Partner
            </h3>

            <div className="space-y-4">
              {contactSection.trustBadges.map((badge, index) => {
                const Icon = badgeIcons[index] || CheckCircle;
                return (
                  <div key={badge} className="flex items-center gap-3">
                    <Icon className="h-6 w-6 text-accent" />
                    <span className="text-foreground font-medium">{badge}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-muted-foreground text-sm">
                {contactSection.servingNote}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

