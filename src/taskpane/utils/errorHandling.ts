/**
 * Error handling utilities for consistent error management
 */

/**
 * Log error with context, avoiding silent catch blocks
 * Returns a formatted error message for display
 */
export function logError(context: string, error: unknown): string {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);

  console.error(`[${timestamp}] [${context}]`, error);

  return errorMessage;
}

/**
 * Wrap a potentially failing operation with proper error handling
 * Ensures errors are never silently swallowed
 */
export async function withErrorHandling<T>(
  context: string,
  operation: () => Promise<T>,
  fallback?: T
): Promise<{ success: boolean; data: T | null; error: string | null }> {
  try {
    const data = await operation();
    return { success: true, data, error: null };
  } catch (error) {
    const errorMessage = logError(context, error);
    return {
      success: false,
      data: fallback ?? null,
      error: errorMessage,
    };
  }
}

/**
 * Synchronous version of withErrorHandling
 */
export function withErrorHandlingSync<T>(
  context: string,
  operation: () => T,
  fallback?: T
): { success: boolean; data: T | null; error: string | null } {
  try {
    const data = operation();
    return { success: true, data, error: null };
  } catch (error) {
    const errorMessage = logError(context, error);
    return {
      success: false,
      data: fallback ?? null,
      error: errorMessage,
    };
  }
}

/**
 * Create a user-friendly error message from an unknown error
 */
export function formatUserError(error: unknown, context?: string): string {
  let message = 'An unexpected error occurred';

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  if (context) {
    return `${context}: ${message}`;
  }
  return message;
}

/**
 * Check if an error is an AbortError (user cancelled)
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError';
  }
  return false;
}

/**
 * Check if an error is a network/fetch error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return error.message.includes('fetch') || error.message.includes('network');
  }
  return false;
}