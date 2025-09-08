/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

export function generateHelpfulErrorMessage(
  error: any,
  context: string,
): string {
  const errorMessage = error?.message || String(error);

  if (
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("ECONNREFUSED")
  ) {
    return `Connection failed to ${context}. Please check your network connection and service availability.`;
  }

  if (errorMessage.includes("ENOTFOUND")) {
    return `Service not found for ${context}. Please verify the service URL and DNS configuration.`;
  }

  if (errorMessage.includes("ETIMEDOUT")) {
    return `Connection timeout to ${context}. The service may be overloaded or unreachable.`;
  }

  if (
    errorMessage.includes("terminated") ||
    errorMessage.includes("other side closed")
  ) {
    return `Connection to ${context} was terminated unexpectedly. Please try again.`;
  }

  return `Error in ${context}: ${errorMessage}`;
}
