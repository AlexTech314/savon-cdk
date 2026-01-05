import { useEffect, useRef } from "react";

const Philosophy = () => {
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
    <section ref={sectionRef} className="py-section border-y border-border bg-secondary/30">
      <div className="container">
        <p className="fade-item opacity-0 font-serif italic text-headline text-foreground/90 max-w-3xl mx-auto text-center leading-relaxed">
          "You're great at what you do. We're great at building websites. Let's help your customers find you online."
        </p>
      </div>
    </section>
  );
};

export default Philosophy;
