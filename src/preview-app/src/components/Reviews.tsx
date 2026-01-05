import { Star, Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ReviewsProps {
  reviewsSection: {
    tagline: string;
    headline: string;
    subheadline: string;
    reviews: {
      text: string;
      rating: number;
      author: string;
    }[];
  };
  rating: number;
  ratingCount: number;
}

export function Reviews({ reviewsSection, rating, ratingCount }: ReviewsProps) {
  return (
    <section id="reviews" className="py-20 bg-gray-section">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-block text-accent font-semibold mb-2">
            {reviewsSection.tagline}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {reviewsSection.headline}
          </h2>

          {/* Rating Display */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`h-6 w-6 ${
                    i < Math.round(rating)
                      ? "fill-accent text-accent"
                      : "text-accent/30"
                  }`}
                />
              ))}
            </div>
            <span className="text-2xl font-bold text-foreground">
              {rating}/5
            </span>
          </div>
          <p className="text-muted-foreground">
            Based on {ratingCount}+ Google Reviews
          </p>
        </div>

        {/* Reviews Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {reviewsSection.reviews.map((review, index) => (
            <Card key={index} className="bg-card border-transparent">
              <CardContent className="pt-6">
                <Quote className="h-10 w-10 text-accent/30 mb-4" />

                {/* Stars */}
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(review.rating)].map((_, i) => (
                    <Star
                      key={i}
                      className="h-5 w-5 fill-accent text-accent"
                    />
                  ))}
                </div>

                {/* Review Text */}
                <p className="text-foreground leading-relaxed mb-6">
                  "{review.text}"
                </p>

                {/* Author */}
                <p className="text-muted-foreground font-medium">
                  — {review.author}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

