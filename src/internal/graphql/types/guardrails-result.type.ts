/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

export interface GuardrailsResult {
  status: "allowed" | "denied" | "pending";
  reason?: string;
}
