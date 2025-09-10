/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

import { convertJsonSchemaToZodSchema } from "@copilotkit/shared";
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import type { ActionInput } from "../graphql/inputs/action.input";
import type { Message } from "../graphql/types/converted";

export function convertMessageToLangChainMessage(
  message: Message,
): BaseMessage | undefined {
  if (message.isTextMessage()) {
    if (message.role === "user") {
      return new HumanMessage(message.content);
    } else if (message.role === "assistant") {
      return new AIMessage(message.content);
    } else if (message.role === "system") {
      return new SystemMessage(message.content);
    }
  } else if (message.isActionExecutionMessage()) {
    return new AIMessage({
      content: "",
      tool_calls: [
        {
          id: message.id,
          args: message.arguments,
          name: message.name,
        },
      ],
    });
  } else if (message.isResultMessage()) {
    return new ToolMessage({
      content: message.result,
      tool_call_id: message.actionExecutionId,
    });
  }
  return undefined;
}

export function convertActionInputToLangChainTool(
  actionInput: ActionInput,
): any {
  return new DynamicStructuredTool({
    name: actionInput.name,
    description: actionInput.description,
    schema: convertJsonSchemaToZodSchema(
      JSON.parse(actionInput.jsonSchema),
      true,
    ) as any,
    func: async () => {
      return "";
    },
  }) as any;
}
