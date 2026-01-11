import { useState, useEffect } from "react";
import { Phone, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  businessName: string;
  phone: string;
}

export function Header({ businessName, phone }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const phoneDigits = phone.replace(/\D/g, "");
  const telUrl = `tel:${phoneDigits}`;
  
  // Handle phone click to work in iframes on iOS
  const handlePhoneClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.open(telUrl, '_top');
  };

  const navLinks = [
    { href: "#services", label: "Services" },
    { href: "#reviews", label: "Reviews" },
    { href: "#contact", label: "Contact" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-card/95 backdrop-blur-md shadow-md py-3"
          : "bg-transparent py-4"
      }`}
    >
      <div className="container mx-auto px-4">
        <nav className="flex items-center justify-between">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2">
            <span
              className={`font-bold text-lg transition-colors ${
                isScrolled ? "text-foreground" : "text-primary-foreground"
              }`}
            >
              {businessName}
            </span>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`font-medium transition-colors hover:text-accent ${
                  isScrolled ? "text-foreground" : "text-primary-foreground"
                }`}
              >
                {link.label}
              </a>
            ))}
            <Button asChild className="gap-2">
              <a href={telUrl} onClick={handlePhoneClick}>
                <Phone className="h-4 w-4" />
                Call Now
              </a>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`md:hidden w-10 h-10 flex items-center justify-center rounded-full ${
              isScrolled
                ? "text-foreground bg-muted"
                : "text-primary-foreground bg-primary-foreground/20"
            }`}
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </nav>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-card shadow-md border-t border-border p-4">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="font-medium text-foreground py-2 hover:text-accent transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <Button asChild className="w-full gap-2">
                <a href={telUrl} onClick={handlePhoneClick}>
                  <Phone className="h-4 w-4" />
                  Call {phone}
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

