/**
 * Normalize a phone number to 10 digits (strip +1 country code)
 */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  // Remove US country code prefix if present (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  return digits;
}

/**
 * Check if a phone number looks fake/invalid
 * Filters out: repeating digits, sequential patterns, obvious test numbers
 */
export function isFakePhone(phone: string): boolean {
  // Must be 10 digits
  if (phone.length !== 10) return true;
  
  // Check for repeating single digit (3333333333)
  if (/^(\d)\1{9}$/.test(phone)) return true;
  
  // Check for mostly same digit (6666666667 - 9+ of same digit)
  const digitCounts: Record<string, number> = {};
  for (const d of phone) {
    digitCounts[d] = (digitCounts[d] || 0) + 1;
  }
  if (Object.values(digitCounts).some(count => count >= 9)) return true;
  
  // Check for repeating 3-digit pattern (7037037037)
  const first3 = phone.slice(0, 3);
  if (phone === first3 + first3 + first3 + first3.slice(0, 1)) return true;
  if (phone === first3.repeat(3) + first3.slice(0, 1)) return true;
  
  // Check for repeating 2-digit pattern (1212121212)
  const first2 = phone.slice(0, 2);
  if (phone === first2.repeat(5)) return true;
  
  // Check for sequential ascending (1234567890)
  if (phone === '1234567890' || phone === '0123456789') return true;
  
  // Check for sequential descending (9876543210)
  if (phone === '9876543210' || phone === '0987654321') return true;
  
  // Common test/fake numbers
  const fakeNumbers = [
    '0000000000', '1111111111', '2222222222', '5555555555',
    '1234567890', '0987654321', '1231231234', '9999999999',
  ];
  if (fakeNumbers.includes(phone)) return true;
  
  // Invalid US area codes (starts with 0 or 1)
  if (phone.startsWith('0') || phone.startsWith('1')) return true;
  
  return false;
}
