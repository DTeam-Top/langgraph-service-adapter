/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

// Type adapters to convert between @copilotkit/runtime types and internal types

// Note: ActionInput and Message are not exported from @copilotkit/runtime
// We'll define minimal interfaces for compatibility
interface RuntimeActionInput {
  name: string;
  description: string;
  jsonSchema: string;
  available?: any; // Use any to handle different enum types from runtime
}

interface RuntimeMessage {
  id: string;
  createdAt: Date;
  isTextMessage(): boolean;
  isActionExecutionMessage(): boolean;
  isResultMessage(): boolean;
  isAgentStateMessage(): boolean;
  isImageMessage(): boolean;
  content?: string;
  role?: string;
  parentMessageId?: string;
  name?: string;
  arguments?: Record<string, any>;
  actionExecutionId?: string;
  actionName?: string;
  result?: string;
  threadId?: string;
  agentName?: string;
  nodeName?: string;
  runId?: string;
  active?: boolean;
  state?: any;
  running?: boolean;
  format?: string;
  bytes?: string;
}

import { ActionInput } from "./graphql/inputs/action.input";
import { Message } from "./graphql/types/converted";
import { ActionInputAvailability } from "./graphql/types/enums";

/**
 * Convert runtime ActionInput to internal ActionInput
 */
export function convertRuntimeActionInput(
  runtimeAction: RuntimeActionInput,
): ActionInput {
  const actionInput = new ActionInput();
  actionInput.name = runtimeAction.name;
  actionInput.description = runtimeAction.description;
  actionInput.jsonSchema = runtimeAction.jsonSchema;

  // Map the availability enum values
  if (runtimeAction.available) {
    const availableValue = String(runtimeAction.available);
    switch (availableValue) {
      case "always":
        actionInput.available = ActionInputAvailability.always;
        break;
      case "when_needed":
        actionInput.available = ActionInputAvailability.when_needed;
        break;
      case "never":
        actionInput.available = ActionInputAvailability.never;
        break;
      case "disabled":
        actionInput.available = ActionInputAvailability.disabled;
        break;
      default:
        actionInput.available = ActionInputAvailability.always;
    }
  }

  return actionInput;
}

/**
 * Convert runtime Message to internal Message
 */
export function convertRuntimeMessage(runtimeMessage: RuntimeMessage): Message {
  // Create a basic message and copy properties
  const message = new Message();
  message.id = runtimeMessage.id;
  message.createdAt = runtimeMessage.createdAt;

  // Copy the type and other properties based on the message type
  if (runtimeMessage.isTextMessage()) {
    message.type = "TextMessage";
    (message as any).content = runtimeMessage.content;
    (message as any).role = runtimeMessage.role;
    (message as any).parentMessageId = runtimeMessage.parentMessageId;
  } else if (runtimeMessage.isActionExecutionMessage()) {
    message.type = "ActionExecutionMessage";
    (message as any).name = runtimeMessage.name;
    (message as any).arguments = runtimeMessage.arguments;
    (message as any).parentMessageId = runtimeMessage.parentMessageId;
  } else if (runtimeMessage.isResultMessage()) {
    message.type = "ResultMessage";
    (message as any).actionExecutionId = runtimeMessage.actionExecutionId;
    (message as any).actionName = runtimeMessage.actionName;
    (message as any).result = runtimeMessage.result;
  } else if (runtimeMessage.isAgentStateMessage()) {
    message.type = "AgentStateMessage";
    (message as any).threadId = runtimeMessage.threadId;
    (message as any).agentName = runtimeMessage.agentName;
    (message as any).nodeName = runtimeMessage.nodeName;
    (message as any).runId = runtimeMessage.runId;
    (message as any).active = runtimeMessage.active;
    (message as any).role = runtimeMessage.role;
    (message as any).state = runtimeMessage.state;
    (message as any).running = runtimeMessage.running;
  } else if (runtimeMessage.isImageMessage()) {
    message.type = "ImageMessage";
    (message as any).format = runtimeMessage.format;
    (message as any).bytes = runtimeMessage.bytes;
    (message as any).role = runtimeMessage.role;
    (message as any).parentMessageId = runtimeMessage.parentMessageId;
  }

  return message;
}
