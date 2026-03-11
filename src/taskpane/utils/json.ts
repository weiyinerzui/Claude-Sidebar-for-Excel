/**
 * Safe JSON parsing utilities with validation
 */

export interface ParseResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

/**
 * Safely parse JSON with type validation
 * Returns a result object instead of throwing
 */
export function safeJsonParse<T>(json: string): ParseResult<T> {
  if (!json || typeof json !== 'string') {
    return {
      success: false,
      data: null,
      error: 'Input must be a non-empty string',
    };
  }

  try {
    const data = JSON.parse(json);
    return {
      success: true,
      data,
      error: null,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown JSON parse error';
    return {
      success: false,
      data: null,
      error: `JSON parse error: ${errorMessage}`,
    };
  }
}

/**
 * Parse JSON with a fallback value
 * Returns the fallback if parsing fails
 */
export function parseJsonWithFallback<T>(json: string, fallback: T): T {
  const result = safeJsonParse<T>(json);
  return result.success && result.data !== null ? result.data : fallback;
}

/**
 * Validate that parsed JSON matches expected structure
 * Use with type guards for runtime validation
 */
export function validateJsonObject<T>(
  data: unknown,
  validator: (data: unknown) => data is T
): ParseResult<T> {
  if (validator(data)) {
    return {
      success: true,
      data,
      error: null,
    };
  }
  return {
    success: false,
    data: null,
    error: 'JSON structure validation failed',
  };
}

/**
 * Type guard factory for checking if an object has required string properties
 */
export function hasRequiredProperties(
  obj: unknown,
  properties: string[]
): obj is Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null) return false;
  return properties.every((prop) => prop in obj);
}