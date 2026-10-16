const MAX_URL_LENGTH = 2048;
const ALIAS_PATTERN = /^[a-zA-Z0-9-]{4,30}$/;
const RESERVED_ALIASES = new Set(["api", "health", "me", "auth", "login", "signup"]);

export function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidAlias(value: string): boolean {
  return ALIAS_PATTERN.test(value) && !RESERVED_ALIASES.has(value.toLowerCase());
}

export function isValidFutureDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const parsed = new Date(value);
  return !isNaN(parsed.getTime()) && parsed.getTime() > Date.now();
}
