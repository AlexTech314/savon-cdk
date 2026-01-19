/**
 * Generate first-names.ts from the union of:
 * 1. unique-names-generator's names list
 * 2. US SSA baby names data (https://github.com/hadley/data-baby-names)
 *
 * This provides maximum coverage for name validation.
 *
 * Usage: npm run generate-names
 */

import { names as uniqueNamesGeneratorList } from 'unique-names-generator';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const BABY_NAMES_URL = 'https://raw.githubusercontent.com/hadley/data-baby-names/refs/heads/master/baby-names.csv';
const OUTPUT_PATH = path.join(__dirname, '../src/pipeline/scrape-task/first-names.ts');

function fetchCSV(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch: ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseNamesFromCSV(csv: string): Set<string> {
  const names = new Set<string>();
  const lines = csv.split('\n');
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Format: "year","name","percent","sex"
    // Extract name (second column)
    const match = line.match(/^\d+,"([^"]+)"/);
    if (match) {
      names.add(match[1].toLowerCase());
    }
  }
  
  return names;
}

function generateTypeScriptFile(names: string[]): string {
  // Sort names alphabetically for consistency
  const sortedNames = [...names].sort();
  
  const header = `/**
 * First names for validation - generated from the union of:
 * - unique-names-generator npm package
 * - US SSA baby names data (https://github.com/hadley/data-baby-names)
 *
 * Total: ${sortedNames.length} names
 *
 * DO NOT EDIT MANUALLY - regenerate with: npm run generate-names (from scripts/)
 */

`;

  // Format as a Set for O(1) lookup
  const namesArray = sortedNames.map(n => `  "${n}"`).join(',\n');
  
  return `${header}export const FIRST_NAMES = new Set([\n${namesArray},\n]);\n`;
}

async function main() {
  console.log('Fetching baby names CSV...');
  const csv = await fetchCSV(BABY_NAMES_URL);
  
  console.log('Parsing CSV...');
  const ssaNames = parseNamesFromCSV(csv);
  console.log(`  Found ${ssaNames.size} unique names in SSA data`);
  
  // Convert unique-names-generator list to lowercase Set
  const ungNames = new Set(uniqueNamesGeneratorList.map(n => n.toLowerCase()));
  console.log(`  Found ${ungNames.size} names in unique-names-generator`);
  
  // Compute union
  const union = new Set<string>([...ssaNames, ...ungNames]);
  console.log(`  Union: ${union.size} names`);
  
  // Generate TypeScript file
  console.log(`\nGenerating ${OUTPUT_PATH}...`);
  const content = generateTypeScriptFile([...union]);
  
  // Ensure directory exists
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_PATH, content, 'utf-8');
  console.log('Done!');
  
  // Print some stats
  console.log('\nStats:');
  console.log(`  SSA baby names: ${ssaNames.size}`);
  console.log(`  unique-names-generator: ${ungNames.size}`);
  console.log(`  Union: ${union.size}`);
}

main().catch(console.error);
