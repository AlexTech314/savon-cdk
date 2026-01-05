const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="py-8 border-t border-border">
      <div className="container">
        <p className="font-sans text-sm text-muted-foreground text-center">
          © {currentYear} Savon Designs. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
