import { Phone } from "lucide-react";

interface FloatingPhoneProps {
  phone: string;
}

export function FloatingPhone({ phone }: FloatingPhoneProps) {
  const phoneDigits = phone.replace(/\D/g, "");

  return (
    <a
      href={`tel:${phoneDigits}`}
      className="fixed bottom-6 right-6 z-50 md:hidden flex items-center justify-center w-16 h-16 bg-accent rounded-full shadow-prominent hover:bg-accent/90 transition-colors animate-pulse-slow"
      aria-label="Call now"
    >
      <Phone className="h-7 w-7 text-accent-foreground" />
    </a>
  );
}

