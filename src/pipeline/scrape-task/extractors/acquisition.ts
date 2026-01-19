import { PATTERNS } from '../config.js';
import type { AcquisitionSignal } from '../types.js';

/**
 * Extract acquisition and ownership change signals from text
 */
export function extractAcquisitionSignals(text: string, sourceUrl: string): AcquisitionSignal[] {
  const signals: AcquisitionSignal[] = [];
  
  // Check each pattern
  const patterns: Array<{ regex: RegExp; type: AcquisitionSignal['signal_type'] }> = [
    { regex: PATTERNS.acquired, type: 'acquired' },
    { regex: PATTERNS.soldTo, type: 'sold' },
    { regex: PATTERNS.merger, type: 'merger' },
    { regex: PATTERNS.newOwnership, type: 'new_ownership' },
    { regex: PATTERNS.rebranded, type: 'rebranded' },
  ];
  
  for (const { regex, type } of patterns) {
    const matches = [...text.matchAll(regex)];
    for (const match of matches) {
      // Try to find a nearby year
      const context = text.substring(
        Math.max(0, match.index! - 50),
        Math.min(text.length, match.index! + match[0].length + 50)
      );
      const yearMatch = context.match(/\b(20\d{2}|19\d{2})\b/);
      
      signals.push({
        text: match[0].trim(),
        signal_type: type,
        date_mentioned: yearMatch?.[1],
        source_url: sourceUrl,
      });
    }
  }
  
  const result = signals.slice(0, 10);
  if (result.length > 0) {
    console.log(`    [Extract:Acquisition] Found ${result.length} signals: ${result.map(s => `${s.signal_type}${s.date_mentioned ? ` (${s.date_mentioned})` : ''}`).join(', ')}`);
  }
  return result;
}
