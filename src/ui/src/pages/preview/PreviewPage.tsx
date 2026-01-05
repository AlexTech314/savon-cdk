import { useParams } from "react-router-dom";
import { useState } from "react";

/**
 * Preview page that embeds the standalone preview-app via iframe.
 * 
 * This ensures the preview is identical to what gets deployed to client domains.
 * The preview-app URL can be configured via environment variable.
 */
export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Preview app URL - in dev, run preview-app on port 5173
  // In production, this would point to a deployed preview-app instance
  const previewAppUrl = import.meta.env.VITE_PREVIEW_APP_URL || "http://localhost:5173";
  const iframeSrc = `${previewAppUrl}?id=${id}`;

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

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
    <div className="min-h-screen bg-muted">
      {/* Header bar with preview info */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </a>
          <span className="text-sm text-muted-foreground">
            Preview: <code className="bg-muted px-2 py-0.5 rounded text-foreground">{id}</code>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:text-accent/80 transition-colors"
          >
            Open in new tab ↗
          </a>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 top-[57px] flex items-center justify-center bg-background z-10">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading preview...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 top-[57px] flex items-center justify-center bg-background z-10">
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

      {/* Iframe embedding the preview-app */}
      <iframe
        src={iframeSrc}
        title={`Preview: ${id}`}
        className="w-full border-0"
        style={{ height: "calc(100vh - 57px)" }}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}

