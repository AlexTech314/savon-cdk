import { useEffect, useRef } from "react";

const ContactCTA = () => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-fade-up");
          }
        });
      },
      { threshold: 0.2 }
    );

    const elements = sectionRef.current?.querySelectorAll(".fade-item");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="contact" className="py-section border-t border-border">
      <div className="container max-w-2xl text-center">
        <h2 className="fade-item opacity-0 font-serif text-display font-medium text-foreground mb-4">
          Ready to get your business online?
        </h2>
        
        <p className="fade-item opacity-0 animation-delay-100 font-sans text-body text-muted-foreground mb-8">
          Drop us a line — we'd love to hear about your business and how we can help.
        </p>
        
        <div className="fade-item opacity-0 animation-delay-200">
          <a 
            href="mailto:hello@savondesigns.com"
            className="group inline-flex items-center gap-3 font-sans text-lg text-foreground link-underline"
          >
            <span>hello@savondesigns.com</span>
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </a>
        </div>
      </div>
    </section>
  );
};

export default ContactCTA;
