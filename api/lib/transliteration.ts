import { transliterate as tr } from 'transliteration';

export function transliterate(text: string): string {
  return tr(text);
}

export function sanitizeUsername(username: string): string {
  // 1. Transliterate (cyrillic, arabic, etc -> latin)
  let result = transliterate(username);
  
  // 2. Remove spaces and invalid characters (allow only alphanumeric, underscore, hyphen)
  // This will also remove any characters that transliteration didn't handle (if any)
  result = result.replace(/[^a-zA-Z0-9_-]/g, '');
  
  // 3. Ensure limits
  if (result.length < 3) result = `user_${result.padEnd(3, '0')}`;
  if (result.length > 30) result = result.substring(0, 30);
  
  return result;
}
