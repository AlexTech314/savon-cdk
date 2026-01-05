import { MapPin, Clock, Phone } from "lucide-react";

interface ServiceAreaProps {
  serviceArea: {
    headline: string;
    addressDisplay: string;
    hoursHeadline: string;
    hoursSubtext: string;
    phoneHeadline: string;
  };
  phone: string;
}

export function ServiceArea({ serviceArea, phone }: ServiceAreaProps) {
  const phoneDigits = phone.replace(/\D/g, "");

  return (
    <section className="py-16 bg-navy">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-8 text-center">
          {/* Location */}
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center mb-4">
              <MapPin className="h-7 w-7 text-accent-foreground" />
            </div>
            <h3 className="text-xl font-bold text-primary-foreground mb-2">
              {serviceArea.headline}
            </h3>
            <p className="text-primary-foreground/80">
              {serviceArea.addressDisplay}
            </p>
          </div>

          {/* Hours */}
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center mb-4">
              <Clock className="h-7 w-7 text-accent-foreground" />
            </div>
            <h3 className="text-xl font-bold text-primary-foreground mb-2">
              {serviceArea.hoursHeadline}
            </h3>
            <p className="text-primary-foreground/80">
              {serviceArea.hoursSubtext}
            </p>
          </div>

          {/* Phone */}
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center mb-4">
              <Phone className="h-7 w-7 text-accent-foreground" />
            </div>
            <h3 className="text-xl font-bold text-primary-foreground mb-2">
              {serviceArea.phoneHeadline}
            </h3>
            <a
              href={`tel:${phoneDigits}`}
              className="text-accent hover:text-accent/80 transition-colors font-semibold text-lg"
            >
              {phone}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

