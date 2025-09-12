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
  disabled = "disabled",
  enabled = "enabled",
  remote = "remote",
}
