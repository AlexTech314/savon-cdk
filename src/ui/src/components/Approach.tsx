import { useEffect, useRef } from "react";

const principles = [
  {
    number: "01",
    title: "We Keep It Simple",
    description: "No jargon, no complicated tech talk. We build you a clean, professional website that does exactly what you need — help customers find you and get in touch."
  },
  {
    number: "02",
    title: "Built For Your Budget",
    description: "We know you're running a business, not a tech startup. Our websites are affordable and designed to pay for themselves with new customers."
  },
  {
    number: "03",
    title: "We're In Your Corner",
    description: "Got a question at 8pm? Need to change your hours? We're real people who pick up the phone. Your website is our website, and we're here to help."
  }
];

const Approach = () => {
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
      { threshold: 0.1 }
    );

    const elements = sectionRef.current?.querySelectorAll(".fade-item");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="py-section bg-secondary/20">
      <div className="container">
        {/* Section header */}
        <div className="fade-item opacity-0 mb-16 flex items-baseline gap-4">
          <span className="font-sans text-small-caps uppercase tracking-widest text-muted-foreground">
            Our Approach
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Principles grid with dividers */}
        <div className="fade-item opacity-0 animation-delay-200 grid grid-cols-1 md:grid-cols-3">
          {principles.map((principle, index) => (
            <div 
              key={principle.number}
              className={`py-8 md:py-0 md:px-8 first:md:pl-0 last:md:pr-0 ${
                index !== principles.length - 1 
                  ? 'border-b md:border-b-0 md:border-r border-border' 
                  : ''
              }`}
            >
              <span className="font-serif text-primary text-lg mb-4 block">
                {principle.number}
              </span>
              <h3 className="font-serif text-xl font-medium text-foreground mb-4">
                {principle.title}
              </h3>
              <p className="font-sans text-body text-muted-foreground leading-relaxed">
                {principle.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Approach;
