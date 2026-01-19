import { COMMON_FIRST_NAMES, NAME_BLACKLIST } from '../config.js';

/**
 * Normalize a name to proper title case (e.g., "joe kremer" -> "Joe Kremer")
 */
export function normalizeName(name: string): string {
  return name.trim().split(/\s+/).map(part => {
    if (part.length <= 2) return part.toUpperCase(); // Initials like "J." stay uppercase
    // Handle special cases like O'Brien, McDonald
    if (part.includes("'")) {
      const [before, after] = part.split("'");
      return before.charAt(0).toUpperCase() + before.slice(1).toLowerCase() + 
             "'" + after.charAt(0).toUpperCase() + after.slice(1).toLowerCase();
    }
    // Handle Mc/Mac names
    if (/^mc/i.test(part) && part.length > 3) {
      return 'Mc' + part.charAt(2).toUpperCase() + part.slice(3).toLowerCase();
    }
    if (/^mac/i.test(part) && part.length > 4) {
      return 'Mac' + part.charAt(3).toUpperCase() + part.slice(4).toLowerCase();
    }
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Check if a string looks like a real person's name
 */
export function isValidPersonName(name: string): boolean {
  const parts = name.trim().split(/\s+/);
  
  // Must have 2-4 parts (first + last, or first + middle + last, etc.)
  if (parts.length < 2 || parts.length > 4) return false;
  
  // Check first name against common names list (case-insensitive)
  const firstName = parts[0].toLowerCase();
  if (!COMMON_FIRST_NAMES.has(firstName)) return false;
  
  // Check that no part is blacklisted
  for (const part of parts) {
    if (NAME_BLACKLIST.has(part.toLowerCase())) return false;
  }
  
  // Each part should look like a name (letters only, allow apostrophes for O'Brien, etc.)
  for (const part of parts) {
    // Allow single initials like "J." or "A"
    if (part.length <= 2) continue;
    // Must be mostly letters (allow apostrophes, hyphens)
    if (!/^[a-zA-Z][a-zA-Z'\-]+$/i.test(part)) return false;
  }
  
  // Last name should be at least 2 characters
  const lastName = parts[parts.length - 1];
  if (lastName.length < 2) return false;
  
  return true;
}
