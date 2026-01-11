import { useParams } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Preview page that embeds the standalone preview-app via iframe.
 * 
 * This ensures the preview is identical to what gets deployed to client domains.
 * The preview-app URL can be configured via environment variable.
 */
export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [isContentReady, setIsContentReady] = useState(false); // True when preview-app content is loaded
  const [hasError, setHasError] = useState(false);
  const [showInterestModal, setShowInterestModal] = useState(false);
  const hasTriggeredModal = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Preview app URL - in dev, run preview-app on port 5173
  // In production, this would point to a deployed preview-app instance
  const previewAppUrl = import.meta.env.VITE_PREVIEW_APP_URL || "http://localhost:5173";
  const iframeSrc = `${previewAppUrl}?id=${id}`;

  const handleLoad = () => {
    setIsLoading(false);
    // Note: iframe loaded, but content inside might still be generating
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // Listen for messages from iframe (scroll events and ready state)
  const handleMessage = useCallback((event: MessageEvent) => {
    // Content is ready - preview-app has finished loading/generating
    if (event.data?.type === 'contentReady') {
      setIsContentReady(true);
    }
    
    // Only handle scroll messages if content is ready and modal hasn't triggered
    if (event.data?.type === 'scroll' && isContentReady && !hasTriggeredModal.current) {
      const scrollY = event.data.scrollY || 0;
      // Show modal when user scrolls past 300px
      if (scrollY > 300) {
        hasTriggeredModal.current = true;
        setShowInterestModal(true);
      }
    }
  }, [isContentReady]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Fallback: show modal after 15 seconds if content is ready
  useEffect(() => {
    if (!isContentReady || hasTriggeredModal.current) return;
    
    // Only show modal after content is fully ready + user has been viewing for a bit
    const timer = setTimeout(() => {
      if (!hasTriggeredModal.current) {
        hasTriggeredModal.current = true;
        setShowInterestModal(true);
      }
    }, 15000); // 15 seconds after content is ready

    return () => clearTimeout(timer);
  }, [isContentReady]);

  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            No Preview ID
          </h1>
          <p className="text-muted-foreground mb-6">
            Please provide a preview ID in the URL.
          </p>
          <a
            href="/"
            className="inline-block bg-accent text-accent-foreground px-6 py-3 rounded-lg font-medium hover:bg-accent/90 transition-colors"
          >
            Go Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading preview...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="text-center max-w-md px-4">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Preview Unavailable
            </h2>
            <p className="text-muted-foreground mb-6">
              The preview app is not running. Start it with:
            </p>
            <code className="block bg-muted px-4 py-3 rounded-lg text-sm text-foreground mb-6">
              cd src/preview-app && npm run dev
            </code>
            <a
              href="/"
              className="inline-block bg-accent text-accent-foreground px-6 py-3 rounded-lg font-medium hover:bg-accent/90 transition-colors"
            >
              Go Home
            </a>
          </div>
        </div>
      )}

      {/* Iframe embedding the preview-app - full screen */}
      {/* 
        Note: tel: links should work in iframes by default.
        If issues persist on iOS, the preview-app can use window.parent navigation.
      */}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="Website Preview"
        className="w-full h-screen border-0"
        onLoad={handleLoad}
        onError={handleError}
      />

      {/* Interest Modal - appears on scroll */}
      {showInterestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-300">
            {/* Close button */}
            <button
              onClick={() => setShowInterestModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Icon */}
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Content */}
            <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-3">
              Like What You See?
            </h2>
            <p className="text-center text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              This website can be yours for a <span className="font-semibold text-blue-600 dark:text-blue-400">small monthly fee</span>. 
              We handle everything — hosting, updates, and support.
            </p>

            {/* CTA */}
            <div className="bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-900/20 dark:to-violet-900/20 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-700 dark:text-gray-300 text-center">
                📧 Simply <span className="font-semibold">reply to our email</span> and we'll get everything set up for you!
              </p>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setShowInterestModal(false)}
                className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
              >
                Keep Exploring
              </button>
              <button
                onClick={() => setShowInterestModal(false)}
                className="w-full py-2 px-6 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

