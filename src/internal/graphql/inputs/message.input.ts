/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

import type { MessageRole } from "../types/enums";

export interface BaseMessageInput {
  id: string;
  createdAt: Date;
}

export interface TextMessageInput extends BaseMessageInput {
  content: string;
  role: MessageRole;
  parentMessageId?: string;
}

export interface ActionExecutionMessageInput extends BaseMessageInput {
  name: string;
  arguments: Record<string, any>;
  parentMessageId?: string;
}

export interface ResultMessageInput extends BaseMessageInput {
  actionExecutionId: string;
  actionName: string;
  result: string;
}

export interface AgentStateMessageInput extends BaseMessageInput {
  threadId: string;
  agentName: string;
  nodeName: string;
  runId: string;
  active: boolean;
  role: MessageRole;
  state: any;
  running: boolean;
}

export interface ImageMessageInput extends BaseMessageInput {
  format: string;
  bytes: string;
  role: MessageRole;
  parentMessageId?: string;
}
