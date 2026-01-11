import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPreviewData, type PreviewData } from "./lib/api";
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

  // Fetch preview data - may take 10-15 seconds for on-demand generation
  const { data, isLoading, error } = useQuery<PreviewData, Error>({
    queryKey: ["preview", previewId],
    queryFn: () => fetchPreviewData(previewId!),
    enabled: !!previewId,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    gcTime: 1000 * 60 * 60,    // Keep in cache for 1 hour
    retry: 1,
    retryDelay: 2000,
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

  // Send scroll position to parent window (for iframe embedding)
  useEffect(() => {
    const handleScroll = () => {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'scroll', scrollY: window.scrollY }, '*');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Notify parent window when content is ready (not loading/generating)
  useEffect(() => {
    if (data && !isLoading && !isResolvingId && window.parent !== window) {
      window.parent.postMessage({ type: 'contentReady' }, '*');
    }
  }, [data, isLoading, isResolvingId]);

  // Loading state - engaging animation for potentially long generation
  if (isResolvingId || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center max-w-md px-6">
          {/* Animated logo/icon */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
            <div className="absolute inset-2 rounded-full bg-blue-500/30 animate-pulse" />
            <div className="absolute inset-4 rounded-full bg-blue-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          
          {/* Main text */}
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Building Your Website
          </h2>
          <p className="text-slate-500 mb-6">
            Generating custom content tailored to your business...
          </p>
          
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-progress" 
                 style={{ 
                   animation: 'progress 12s ease-out forwards',
                 }} 
            />
          </div>
          
          {/* Subtle helper text */}
          <p className="text-xs text-slate-400 mt-4">
            This may take a few seconds
          </p>
        </div>
        
        {/* CSS for progress animation */}
        <style>{`
          @keyframes progress {
            0% { width: 0%; }
            10% { width: 15%; }
            30% { width: 35%; }
            50% { width: 55%; }
            70% { width: 75%; }
            90% { width: 90%; }
            100% { width: 95%; }
          }
        `}</style>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            {error?.message?.includes('not found') ? "Business Not Found" : "Something Went Wrong"}
          </h1>
          <p className="text-slate-500 mb-6">
            {previewId 
              ? `We couldn't load the preview for "${previewId}". Please check the URL and try again.`
              : "No preview ID was provided. Add ?id=your-id to the URL."}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Try Again
          </button>
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
          phone={data.phone}
        />

        <Services servicesSection={data.servicesSection} />

        <WhyChooseUs whyChooseUs={data.whyChooseUs} />

        <ServiceArea serviceArea={data.serviceArea} phone={data.phone} />

        <Reviews
          reviewsSection={data.reviewsSection}
          rating={data.rating}
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

