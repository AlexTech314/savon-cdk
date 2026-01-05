import { useEffect, useRef } from "react";

const Hero = () => {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-fade-up");
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = heroRef.current?.querySelectorAll(".fade-item");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section 
      ref={heroRef}
      className="min-h-screen flex flex-col justify-center pt-20 pb-section"
    >
      <div className="container max-w-4xl">
        {/* Decorative element */}
        <div className="fade-item opacity-0 animation-delay-100 mb-12">
          <div className="w-12 h-px bg-primary" />
        </div>
        
        {/* Main headline */}
        <h1 className="fade-item opacity-0 animation-delay-200 font-serif text-display font-medium text-foreground mb-8">
          Your business deserves a website that works as hard as you do.
        </h1>
        
        {/* Subtext */}
        <p className="fade-item opacity-0 animation-delay-300 font-sans text-subhead text-muted-foreground max-w-xl mb-12">
          We help local businesses like plumbers, groomers, and contractors get online with simple, professional websites that bring in new customers.
        </p>
        
        {/* CTA Button */}
        <div className="fade-item opacity-0 animation-delay-400">
          <a 
            href="#contact"
            className="inline-flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground font-sans font-medium text-sm tracking-wide transition-all duration-300 hover:bg-primary/90 hover:-translate-y-0.5"
          >
            Let's talk
            <span className="animate-arrow-bounce">→</span>
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
