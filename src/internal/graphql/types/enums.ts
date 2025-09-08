/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

export enum MessageRole {
  user = "user",
  assistant = "assistant",
  system = "system",
  tool = "tool",
  developer = "developer",
}

export enum ActionInputAvailability {
  always = "always",
  when_needed = "when_needed",
  never = "never",
  disabled = "disabled",
}
