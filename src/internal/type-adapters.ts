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
import {
  ActionExecutionMessage,
  AgentStateMessage,
  ImageMessage,
  Message,
  ResultMessage,
  TextMessage,
} from "./graphql/types/converted";
import { ActionInputAvailability, MessageRole } from "./graphql/types/enums";

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
      case "enabled":
        actionInput.available = ActionInputAvailability.enabled;
        break;
      case "remote":
        actionInput.available = ActionInputAvailability.remote;
        break;
      case "disabled":
        actionInput.available = ActionInputAvailability.disabled;
        break;
      default:
        actionInput.available = ActionInputAvailability.enabled;
    }
  }

  return actionInput;
}

/**
 * Convert runtime Message to internal Message
 */
export function convertRuntimeMessage(runtimeMessage: RuntimeMessage): Message {
  // Construct specific message type instances to avoid `as any`.
  if (runtimeMessage.isTextMessage()) {
    const msg = new TextMessage();
    msg.id = runtimeMessage.id;
    msg.createdAt = runtimeMessage.createdAt;
    if (typeof runtimeMessage.content === "string")
      msg.content = runtimeMessage.content;
    if (
      runtimeMessage.role === MessageRole.user ||
      runtimeMessage.role === MessageRole.assistant ||
      runtimeMessage.role === MessageRole.system
    ) {
      msg.role = runtimeMessage.role;
    }
    if (runtimeMessage.parentMessageId)
      msg.parentMessageId = runtimeMessage.parentMessageId;
    return msg;
  }

  if (runtimeMessage.isActionExecutionMessage()) {
    const msg = new ActionExecutionMessage();
    msg.id = runtimeMessage.id;
    msg.createdAt = runtimeMessage.createdAt;
    if (runtimeMessage.name) msg.name = runtimeMessage.name;
    if (runtimeMessage.arguments) msg.arguments = runtimeMessage.arguments;
    if (runtimeMessage.parentMessageId)
      msg.parentMessageId = runtimeMessage.parentMessageId;
    return msg;
  }

  if (runtimeMessage.isResultMessage()) {
    const msg = new ResultMessage();
    msg.id = runtimeMessage.id;
    msg.createdAt = runtimeMessage.createdAt;
    if (runtimeMessage.actionExecutionId)
      msg.actionExecutionId = runtimeMessage.actionExecutionId;
    if (runtimeMessage.actionName) msg.actionName = runtimeMessage.actionName;
    if (typeof runtimeMessage.result === "string")
      msg.result = runtimeMessage.result;
    return msg;
  }

  if (runtimeMessage.isAgentStateMessage()) {
    const msg = new AgentStateMessage();
    msg.id = runtimeMessage.id;
    msg.createdAt = runtimeMessage.createdAt;
    if (runtimeMessage.threadId) msg.threadId = runtimeMessage.threadId;
    if (runtimeMessage.agentName) msg.agentName = runtimeMessage.agentName;
    if (runtimeMessage.nodeName) msg.nodeName = runtimeMessage.nodeName;
    if (runtimeMessage.runId) msg.runId = runtimeMessage.runId;
    if (typeof runtimeMessage.active === "boolean")
      msg.active = runtimeMessage.active;
    if (
      runtimeMessage.role === MessageRole.user ||
      runtimeMessage.role === MessageRole.assistant ||
      runtimeMessage.role === MessageRole.system
    ) {
      // AgentStateMessage defaults to assistant; override if valid provided
      msg.role = runtimeMessage.role;
    }
    if (runtimeMessage.state !== undefined) msg.state = runtimeMessage.state;
    if (typeof runtimeMessage.running === "boolean")
      msg.running = runtimeMessage.running;
    return msg;
  }

  if (runtimeMessage.isImageMessage()) {
    const msg = new ImageMessage();
    msg.id = runtimeMessage.id;
    msg.createdAt = runtimeMessage.createdAt;
    if (runtimeMessage.format) msg.format = runtimeMessage.format;
    if (runtimeMessage.bytes) msg.bytes = runtimeMessage.bytes;
    if (
      runtimeMessage.role === MessageRole.user ||
      runtimeMessage.role === MessageRole.assistant ||
      runtimeMessage.role === MessageRole.system
    ) {
      msg.role = runtimeMessage.role;
    }
    if (runtimeMessage.parentMessageId)
      msg.parentMessageId = runtimeMessage.parentMessageId;
    return msg;
  }

  // Fallback to base Message if type guards are not satisfied
  const fallback = new Message();
  fallback.id = runtimeMessage.id;
  fallback.createdAt = runtimeMessage.createdAt;
  return fallback;
}
