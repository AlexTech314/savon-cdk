# Savon Designs CDK

AWS CDK infrastructure and applications for Savon Designs - a landing page generation platform for local businesses.

## Project Structure

```
savon-cdk/
├── bin/                    # CDK app entry point
├── lib/                    # CDK stack definitions
├── src/
│   ├── config-lambda/      # Lambda for configuration management
│   ├── preview-app/        # Standalone client landing page app (deployable)
│   └── ui/                 # Admin dashboard / preview system
└── test/                   # CDK tests
```

## Applications

### Admin UI (`src/ui`)

The internal dashboard for managing client landing pages. Includes a preview system at `/preview/:id` that embeds the preview-app via iframe.

```bash
cd src/ui
npm install
npm run dev       # Runs on http://localhost:8080
```

**Note:** The preview page requires the preview-app to be running (see below).

### Preview App (`src/preview-app`)

Standalone, deployable landing page application for client sites. This is the production-ready app that gets deployed to customer domains.

**Features:**
- Fetches data from API based on ID (query param or domain lookup)
- Full SEO support (meta tags, JSON-LD)
- Dynamic theming via CSS custom properties
- Mobile-first, responsive design
- Floating call button for mobile

**ID Resolution:**
1. Query parameter: `?id=nyc-plumber` (for iframe embedding / preview)
2. Domain lookup: `nycplumber.com` → API returns ID (for production)

```bash
cd src/preview-app
npm install
npm run dev       # Runs on http://localhost:5173
npm run build     # Produces static assets in dist/
```

**Environment Variables:**
- `VITE_API_BASE_URL` - Base URL for the preview API (optional, defaults to relative path)

**Deployment Options:**
1. **Iframe Embed**: Deploy once, embed with `<iframe src="https://previews.savondesigns.com?id=client-id">`
2. **Custom Domain**: Deploy to S3/CloudFront, map client domain to their specific build
3. **Edge Proxy**: Single deployment with edge function that injects ID based on hostname

## CDK Commands

```bash
npm run build     # Compile TypeScript
npm run watch     # Watch for changes
npm run test      # Run Jest tests
npx cdk deploy    # Deploy stack to AWS
npx cdk diff      # Compare deployed stack with current
npx cdk synth     # Emit CloudFormation template
```

## API Contract

The preview app expects data conforming to this interface:

```typescript
interface PreviewData {
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
  heroImage: string;
  
  seo: {
    title: string;
    description: string;
    keywords: string;
    schemaType: string;
  };
  
  theme: {
    primary: string;      // HSL values, e.g. "224 64% 33%"
    primaryDark: string;
    accent: string;
    // ... other theme values
  };
  
  hero: { headline, subheadline, primaryCta, secondaryCta, trustBadges };
  servicesSection: { tagline, headline, subheadline, services[] };
  whyChooseUs: { tagline, headline, benefits[] };
  serviceArea: { headline, addressDisplay, hoursHeadline, hoursSubtext, phoneHeadline };
  reviewsSection: { tagline, headline, subheadline, reviews[] };
  emergencyCta: { headline, subheadline, ctaText };
  contactSection: { tagline, headline, trustBadges[], servingNote };
  footer: { copyright, links[] };
}
```

See `src/preview-app/src/lib/api.ts` or `src/ui/src/lib/previewApi.ts` for the full type definition.

## Mock Data Testing

The UI app includes mock data for testing different business types:

- `nyc-plumber` - NYC Emergency Plumber (24/7 service)
- `boston-cpa` - Boston CPA firm
- `dallas-hvac` - Dallas HVAC company
- `denver-chiro` - Denver chiropractor
- `chicago-cleaning` - Chicago cleaning service
- `seattle-it` - Seattle IT support

## Local Development

To run the full preview system locally, start both apps:

```bash
# Terminal 1: Admin UI (port 8080)
cd src/ui && npm run dev

# Terminal 2: Preview App (port 5173)
cd src/preview-app && npm run dev
```

Then access previews at: `http://localhost:8080/preview/boston-cpa`
