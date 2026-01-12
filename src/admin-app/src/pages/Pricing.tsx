import React from 'react';
import { PRICING, getPricingSources, formatCost, estimatePipelineCost } from '@/lib/pricing';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, AlertTriangle, DollarSign, Calculator } from 'lucide-react';

const Pricing: React.FC = () => {
  const sources = getPricingSources();
  const pipelineCost = estimatePipelineCost(1);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pricing Information</h1>
        <p className="text-muted-foreground">
          Cost estimates for API calls and infrastructure
        </p>
      </div>

      {/* Disclaimer */}
      <Card className="border-yellow-500/50 bg-yellow-500/5">
        <CardContent className="flex items-start gap-3 pt-6">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">
              Estimates Only
            </p>
            <p className="text-sm text-muted-foreground">
              These costs are estimates based on publicly available pricing as of the dates shown.
              Actual costs may vary based on usage tiers, regions, promotional credits, and your
              specific billing agreements with each provider.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quick Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Quick Reference
          </CardTitle>
          <CardDescription>
            Common action costs for quick estimation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Breakdown</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Generate Preview (1 business)</TableCell>
                <TableCell className="text-muted-foreground">Details + Reviews + Copy</TableCell>
                <TableCell className="text-right font-mono">{pipelineCost.formatted}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Generate Preview (10 businesses)</TableCell>
                <TableCell className="text-muted-foreground">10 x Pipeline</TableCell>
                <TableCell className="text-right font-mono">{formatCost(pipelineCost.total * 10)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Generate Preview (100 businesses)</TableCell>
                <TableCell className="text-muted-foreground">100 x Pipeline</TableCell>
                <TableCell className="text-right font-mono">{formatCost(pipelineCost.total * 100)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Fetch Details Only</TableCell>
                <TableCell className="text-muted-foreground">Google Place Details API</TableCell>
                <TableCell className="text-right font-mono">{formatCost(PRICING.google.placeDetails)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Fetch Reviews Only</TableCell>
                <TableCell className="text-muted-foreground">Google Reviews API</TableCell>
                <TableCell className="text-right font-mono">{formatCost(PRICING.google.placeDetailsReviews)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Search Query</TableCell>
                <TableCell className="text-muted-foreground">Google Text Search API</TableCell>
                <TableCell className="text-right font-mono">{formatCost(PRICING.google.textSearch.pricePerRequest)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Google Places API */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Google Places API
          </CardTitle>
          <CardDescription>
            Pricing for place search and details (0-100K requests/month tier)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Per Request</TableHead>
                <TableHead className="text-right">Per 1,000</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Text Search (Pro)</TableCell>
                <TableCell className="text-muted-foreground">Search for places by query</TableCell>
                <TableCell className="text-right font-mono">{formatCost(PRICING.google.textSearch.pricePerRequest)}</TableCell>
                <TableCell className="text-right font-mono">$32.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Place Details (Advanced)</TableCell>
                <TableCell className="text-muted-foreground">Address, phone, hours, rating, location</TableCell>
                <TableCell className="text-right font-mono">{formatCost(PRICING.google.placeDetails)}</TableCell>
                <TableCell className="text-right font-mono">$20.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Place Details (Preferred)</TableCell>
                <TableCell className="text-muted-foreground">Reviews, editorial summary</TableCell>
                <TableCell className="text-right font-mono">{formatCost(PRICING.google.placeDetailsReviews)}</TableCell>
                <TableCell className="text-right font-mono">$25.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Photos</TableCell>
                <TableCell className="text-muted-foreground">Photo references and media</TableCell>
                <TableCell className="text-right font-mono">{formatCost(PRICING.google.photos)}</TableCell>
                <TableCell className="text-right font-mono">$7.00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-4 text-sm text-muted-foreground">
            <Badge variant="secondary" className="mr-2">Free Tier</Badge>
            $200/month in Google Maps Platform credits
          </p>
        </CardContent>
      </Card>

      {/* Anthropic Claude API */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Anthropic Claude API
          </CardTitle>
          <CardDescription>
            Claude Sonnet 4 pricing for LLM copy generation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Per 1M Tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Input Tokens</TableCell>
                <TableCell className="text-muted-foreground">Prompt and business data</TableCell>
                <TableCell className="text-right font-mono">$3.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Output Tokens</TableCell>
                <TableCell className="text-muted-foreground">Generated copy response</TableCell>
                <TableCell className="text-right font-mono">$15.00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="mt-4 rounded-lg bg-muted/50 p-3">
            <p className="text-sm font-medium">Average Per Generation</p>
            <p className="text-sm text-muted-foreground">
              ~{PRICING.claude.avgInputTokens.toLocaleString()} input tokens + 
              ~{PRICING.claude.avgOutputTokens.toLocaleString()} output tokens = 
              <span className="font-mono ml-1">
                {formatCost(
                  PRICING.claude.avgInputTokens * PRICING.claude.inputPerToken +
                  PRICING.claude.avgOutputTokens * PRICING.claude.outputPerToken
                )}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* AWS Services */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            AWS Services
          </CardTitle>
          <CardDescription>
            Infrastructure costs (US East region, on-demand pricing)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Lambda</TableCell>
                <TableCell className="text-muted-foreground">Per 1M requests</TableCell>
                <TableCell className="text-right font-mono">$0.20</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Lambda</TableCell>
                <TableCell className="text-muted-foreground">Per GB-second</TableCell>
                <TableCell className="text-right font-mono">$0.0000166667</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Fargate</TableCell>
                <TableCell className="text-muted-foreground">Per vCPU-hour</TableCell>
                <TableCell className="text-right font-mono">$0.04048</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Fargate</TableCell>
                <TableCell className="text-muted-foreground">Per GB-hour</TableCell>
                <TableCell className="text-right font-mono">$0.004445</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">DynamoDB</TableCell>
                <TableCell className="text-muted-foreground">Per 1M write request units</TableCell>
                <TableCell className="text-right font-mono">$0.625</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">DynamoDB</TableCell>
                <TableCell className="text-muted-foreground">Per 1M read request units</TableCell>
                <TableCell className="text-right font-mono">$0.125</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-4 text-sm text-muted-foreground">
            <Badge variant="secondary" className="mr-2">Note</Badge>
            AWS costs are typically negligible compared to API costs for this application
          </p>
        </CardContent>
      </Card>

      {/* Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing Sources</CardTitle>
          <CardDescription>
            Official documentation used for these estimates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sources.map((source, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-4 rounded-lg border border-border p-3"
              >
                <div>
                  <p className="font-medium">{source.name}</p>
                  <p className="text-sm text-muted-foreground">{source.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Last verified: {source.updated}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1"
                  onClick={() => window.open(source.url, '_blank')}
                >
                  <ExternalLink className="h-3 w-3" />
                  View
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Pricing;
