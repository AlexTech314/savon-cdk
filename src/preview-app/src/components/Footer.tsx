interface FooterProps {
  footer: {
    copyright: string;
    links?: { label: string; href: string }[];
  };
  businessName: string;
}

export function Footer({ footer, businessName }: FooterProps) {
  return (
    <footer className="py-8 bg-foreground">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-primary-foreground/70 text-sm">{footer.copyright}</p>

          {footer.links && footer.links.length > 0 && (
            <div className="flex gap-6">
              {footer.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-primary-foreground/70 hover:text-primary-foreground text-sm transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}

