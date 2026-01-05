// Preview API types - shared with preview-app
// The actual rendering and data fetching now happens in preview-app

export interface PreviewData {
  id: string;
  businessName: string;
  businessType: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  rating: number;
  ratingCount: number;
  hoursDisplay: string;
  seo: {
    title: string;
    description: string;
  };
}

// Available preview IDs for the admin UI to list
export const availablePreviewIds = [
  "nyc-plumber",
  "boston-cpa",
  "dallas-hvac",
  "denver-chiro",
  "chicago-cleaning",
  "seattle-it",
] as const;

export type PreviewId = (typeof availablePreviewIds)[number];
