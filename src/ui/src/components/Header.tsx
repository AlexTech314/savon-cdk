import logoIcon from "@/assets/logo-icon.svg";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="container flex items-center justify-between py-5">
        <a href="/" className="hover-lift flex items-center gap-3">
          <img src={logoIcon} alt="Savon Designs" className="h-8 w-auto" />
          <span className="font-serif text-lg font-medium text-foreground">Savon Designs</span>
        </a>
        <a 
          href="#contact" 
          className="font-sans text-sm font-medium link-underline text-foreground"
        >
          Get in touch
        </a>
      </div>
    </header>
  );
};

export default Header;
