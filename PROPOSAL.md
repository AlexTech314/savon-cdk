# Google Places API Pipeline Optimization Proposal

## Current Architecture

The pipeline currently uses a multi-stage approach with separate API calls:

| Stage | API Call | Cost/1000 | Data Retrieved |
|-------|----------|-----------|----------------|
| Search | Text Search Pro | $32 | `id`, `displayName`, `formattedAddress`, `location`, `types` |
| Details | Place Details Enterprise | $20 | `phone`, `website`, `rating`, `hours`, `priceLevel` |
| Enrich | Place Details Enterprise+Atmosphere | $25 | `reviews`, `editorialSummary`, atmosphere data |
| Photos | Place Details (photos) | $7 | Photo references + URLs |

**Current total cost per 1000 businesses: $84**

---

## Discovery: Text Search Supports All Tiers

Google's Text Search API supports the same tier structure as Place Details:

| Tier | Cost/1000 | Fields Available |
|------|-----------|------------------|
| **Essentials** | $5 | `id`, `photos` (references) |
| **Pro** | $32 | + `displayName`, `formattedAddress`, `addressComponents`, `location`, `types`, `businessStatus`, `googleMapsUri` |
| **Enterprise** | $35 | + `websiteUri`, `nationalPhoneNumber`, `internationalPhoneNumber`, `rating`, `userRatingCount`, `regularOpeningHours`, `currentOpeningHours`, `priceLevel`, `priceRange` |
| **Enterprise + Atmosphere** | $40 | + `reviews`, `editorialSummary`, `allowsDogs`, `goodForChildren`, `delivery`, `dineIn`, `takeout`, `servesBeer`, `servesBreakfast`, `outdoorSeating`, `reservable`, `parkingOptions`, `paymentOptions`, `accessibilityOptions`, and more |

**Key insight**: A single Text Search call at Enterprise+Atmosphere tier returns ALL the data we currently fetch across 3 separate API calls.

---

## Proposed Architecture

Consolidate into a single search task:

| Stage | API Call | Cost/1000 | Data Retrieved |
|-------|----------|-----------|----------------|
| Search | Text Search Enterprise+Atmosphere | $40 | **Everything** (address, phone, website, rating, hours, reviews, atmosphere) |
| Photos | Place Details (photos) | $7 | Photo references + URLs |

**Proposed total cost per 1000 businesses: $47**

---

## Cost Comparison

| Scenario | Current | Proposed | Savings |
|----------|---------|----------|---------|
| 1,000 businesses | $84 | $47 | **$37 (44%)** |
| 10,000 businesses | $840 | $470 | **$370 (44%)** |
| 100,000 businesses | $8,400 | $4,700 | **$3,700 (44%)** |

### Volume Discounts

Google offers tiered pricing that reduces costs at higher volumes:

| Monthly Requests | Enterprise+Atmosphere per 1000 |
|------------------|-------------------------------|
| 0 - 100,000 | $40.00 |
| 100,001 - 500,000 | $32.00 |
| 500,001 - 1,000,000 | $24.00 |
| 1,000,001 - 5,000,000 | $12.00 |
| 5,000,001+ | $3.40 |

At scale (1M+ requests/month), the all-in-one approach costs only **$12/1000** vs the current **$84/1000**.

---

## Additional Benefits

### 1. Simpler Architecture
- Fewer moving parts
- Single point of failure instead of 4
- Easier to debug and maintain

### 2. Faster Pipeline Execution
- One API call instead of 3 per business
- No need to wait for previous stages to complete
- Reduced rate limiting concerns

### 3. Data Consistency
- All data fetched at the same moment
- No risk of stale data between stages
- Single timestamp for all fields

### 4. Immediate Filtering
- Can filter by website, rating, reviews immediately after search
- No need to run details task before filtering

---

## What About Filtering?

The current architecture was designed to save costs by filtering out businesses (e.g., those with websites) before fetching expensive details.

### When the Current Approach Still Makes Sense

If you expect to **discard more than 50%** of search results before needing their details, the staged approach may still be cheaper:

| Scenario | Current (filtered) | All-in-one |
|----------|-------------------|------------|
| Keep 100% of results | $84 | **$47** ✓ |
| Keep 50% of results | $32 + ($45 × 0.5) = $54.50 | **$47** ✓ |
| Keep 25% of results | $32 + ($45 × 0.25) = **$43.25** ✓ | $47 |
| Keep 10% of results | $32 + ($45 × 0.1) = **$36.50** ✓ | $47 |

**Break-even point**: ~35% retention rate

---

## Recommendation

### If you typically process most search results:
**Use the all-in-one approach** - 44% cost savings, simpler architecture

### If you heavily filter (>65% discarded):
**Keep the staged approach** - but only run Search Pro, then Details+Enrich combined

---

## Implementation Plan

### Phase 1: Update Search Task
1. Change field mask to request Enterprise+Atmosphere tier fields
2. Add all data extraction (reviews, atmosphere, hours, etc.)
3. Mark `details_fetched` and `reviews_fetched` as true in search

### Phase 2: Make Details/Enrich Tasks Optional
1. Keep tasks for re-processing or backfill scenarios
2. Update pipeline to skip if data already present

### Phase 3: Update Cost Estimation
1. Update admin UI cost calculator
2. Show accurate pricing based on new architecture

---

## Questions to Consider

1. What is our typical retention rate after filtering?
2. Do we need real-time `currentOpeningHours` (open now)?
3. Are there any fields we don't actually use that we can drop?

---

## Next Steps

- [ ] Approve proposal
- [ ] Implement Phase 1 (search task update)
- [ ] Test with sample campaign
- [ ] Verify cost savings in billing
- [ ] Roll out to production
