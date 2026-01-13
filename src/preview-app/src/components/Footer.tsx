interface FooterProps {
  footer: {
    copyright: string;
    links?: { label: string; href: string }[];
  };
  businessName: string;
}

export function Footer({ footer }: FooterProps) {
  return (
    <footer className="py-8 bg-foreground">
      <div className="container mx-auto px-4">
        <div className="flex justify-center items-center">
          <p className="text-primary-foreground/70 text-sm">{footer.copyright}</p>
        </div>
      </div>
    </footer>
  );
}

