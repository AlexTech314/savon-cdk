import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPreviewData, PreviewNotGeneratedError, type PreviewData } from "./lib/api";
import {
  Header,
  Hero,
  Services,
  WhyChooseUs,
  ServiceArea,
  Reviews,
  EmergencyCTA,
  Contact,
  Footer,
  FloatingPhone,
} from "./components";

/**
 * Standalone Preview App
 * 
 * Resolves the preview ID from:
 * 1. Query parameter: ?id=nyc-plumber (for iframe embedding)
 * 2. Domain lookup: nycplumber.com → API returns ID (for custom domains)
 */
export default function App() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isResolvingId, setIsResolvingId] = useState(true);

  // Resolve preview ID on mount
  useEffect(() => {
    async function resolveId() {
      // 1. Check query param (iframe mode)
      const params = new URLSearchParams(window.location.search);
      const idParam = params.get("id");

      if (idParam) {
        setPreviewId(idParam);
        setIsResolvingId(false);
        return;
      }

      // 2. Check for custom domain (production mode)
      const hostname = window.location.hostname;
      
      // Skip domain lookup for localhost/dev - default to first business
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        // Default to a test ID in development (use any slug from the CSV)
        setPreviewId("elite-bookkeeping-solutions-brooklyn-long-island");
        setIsResolvingId(false);
        return;
      }

      // 3. Lookup ID by domain via API
      try {
        const response = await fetch(`/api/domain-lookup?domain=${hostname}`);
        if (response.ok) {
          const data = await response.json();
          setPreviewId(data.id);
        } else {
          console.error("Domain lookup failed");
          setPreviewId(null);
        }
      } catch (error) {
        console.error("Domain lookup error:", error);
        setPreviewId(null);
      }
      
      setIsResolvingId(false);
    }

    resolveId();
  }, []);

  // Fetch preview data
  const { data, isLoading, error } = useQuery<PreviewData, Error>({
    queryKey: ["preview", previewId],
    queryFn: () => fetchPreviewData(previewId!),
    enabled: !!previewId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  // Apply SEO when data loads
  useEffect(() => {
    if (!data) return;

    document.title = data.seo.title;

    // Meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", data.seo.description);

    // Meta keywords
    let metaKeywords = document.querySelector('meta[name="keywords"]');
    if (!metaKeywords) {
      metaKeywords = document.createElement("meta");
      metaKeywords.setAttribute("name", "keywords");
      document.head.appendChild(metaKeywords);
    }
    metaKeywords.setAttribute("content", data.seo.keywords);

    // JSON-LD structured data
    let jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (!jsonLd) {
      jsonLd = document.createElement("script");
      jsonLd.setAttribute("type", "application/ld+json");
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": data.seo.schemaType,
      name: data.businessName,
      image: data.heroImage,
      address: {
        "@type": "PostalAddress",
        streetAddress: data.address.split(",")[0],
        addressLocality: data.city,
        addressRegion: data.state,
        postalCode: data.zipCode,
        addressCountry: "US",
      },
      telephone: data.phone,
      priceRange: "$$",
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: data.rating.toString(),
        reviewCount: data.ratingCount.toString(),
      },
    });
  }, [data]);

  // Loading state
  if (isResolvingId || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Error state - check for preview not generated
  if (error || !data) {
    const isPreviewNotGenerated = error instanceof PreviewNotGeneratedError;
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            {isPreviewNotGenerated ? "Preview Does Not Exist" : "Site Not Found"}
          </h1>
          <p className="text-muted-foreground mb-6">
            {isPreviewNotGenerated
              ? "This business hasn't had a preview generated yet. Generate a preview from the admin dashboard."
              : previewId 
                ? `Could not load preview for "${previewId}".`
                : "No preview ID was provided. Add ?id=your-id to the URL."}
          </p>
        </div>
      </div>
    );
  }

  // Apply theme via CSS custom properties
  const themeStyles = {
    "--primary": data.theme.primary,
    "--primary-foreground": "0 0% 100%",
    "--navy": data.theme.primary,
    "--navy-dark": data.theme.primaryDark,
    "--accent": data.theme.accent,
    "--accent-foreground": "0 0% 100%",
    "--background": data.theme.background,
    "--foreground": data.theme.foreground,
    "--gray-section": data.theme.graySection,
  } as React.CSSProperties;

  return (
    <div style={themeStyles} className="min-h-screen">
      <Header businessName={data.businessName} phone={data.phone} />

      <main>
        <Hero
          hero={data.hero}
          heroImage={data.heroImage}
          rating={data.rating}
          ratingCount={data.ratingCount}
          phone={data.phone}
        />

        <Services servicesSection={data.servicesSection} />

        <WhyChooseUs whyChooseUs={data.whyChooseUs} />

        <ServiceArea serviceArea={data.serviceArea} phone={data.phone} />

        <Reviews
          reviewsSection={data.reviewsSection}
          rating={data.rating}
          ratingCount={data.ratingCount}
        />

        <EmergencyCTA emergencyCta={data.emergencyCta} phone={data.phone} />

        <Contact
          contactSection={data.contactSection}
          businessName={data.businessName}
          phone={data.phone}
          address={data.address}
          hoursDisplay={data.hoursDisplay}
        />
      </main>

      <Footer footer={data.footer} businessName={data.businessName} />

      <FloatingPhone phone={data.phone} />
    </div>
  );
}

