import { convertServiceAdapterError } from "@copilotkit/runtime";
import { randomUUID } from "@copilotkit/shared";
import type {
  AIMessageChunk,
  BaseMessage,
  MessageContent,
  ToolMessage,
} from "@langchain/core/messages";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
import { START } from "@langchain/langgraph";
import { type RuntimeEventSubject, RuntimeEventTypes } from "./internal/events";
import type { ActionInput } from "./internal/graphql/inputs/action.input";
import type { Message } from "./internal/graphql/types/converted";
import { convertMessageToLangChainMessage } from "./internal/langchain/utils";
import type { LangGraphInput, StreamState } from "./types";

/**
 * Convert CopilotKit format to LangGraph input
 */
export function convertCopilotKitToLangGraphInput({
  messages,
  actions,
  debug = false,
}: {
  messages: Message[];
  actions: ActionInput[];
  debug?: boolean;
}): LangGraphInput {
  if (debug) {
    console.log(
      "[DEBUG] Converting:",
      messages.length,
      "messages,",
      actions.length,
      "actions",
    );
  }

  try {
    const convertedMessages = messages
      .map((msg) => convertMessageToLangChainMessage(msg))
      .filter((msg): msg is BaseMessage => msg !== undefined);

    const langChainMessages = convertedMessages;
    if (debug && actions.length > 0) {
      console.log(
        `[DEBUG] Converted ${actions.length} CopilotKit actions to LangGraph`,
      );
    }

    const result = {
      messages: langChainMessages,
      actions: actions,
    };

    if (debug) {
      console.log("[DEBUG] LangGraphInput:", {
        messagesCount: result.messages.length,
        actionsCount: result.actions.length,
      });
    }

    return result;
  } catch (error) {
    if (debug) {
      console.error(
        "[DEBUG] Error in convertCopilotKitToLangGraphInput:",
        error,
      );
    }
    // Use CopilotKit's standard error conversion for input conversion errors
    throw convertServiceAdapterError(error, "LangGraph");
  }
}

/**
 * Create initial stream state
 */
export function createStreamState(): StreamState {
  return {
    runId: randomUUID(),
    idInProgress: null,
    currentNodeName: undefined,
    mode: null,
  };
}

/**
 * Main event handler for LangGraph StreamEvents
 */
export async function handleLangGraphEvent(
  event: StreamEvent,
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
  debug = false,
): Promise<void> {
  try {
    if (debug) {
      console.log(`[LangGraph] Processing event: ${event.event}`);
      console.log(`[LangGraph] Event Object:`, event);
      console.log(`[LangGraph] Current StreamState:`, streamState);
    }

    if (!streamState.runId && event.run_id) {
      streamState.runId = event.run_id;
    }

    // Direct LangGraph event processing - simplified approach
    switch (event.event) {
      case "on_chat_model_stream":
        await handleChatModelStream(event, eventStream$, streamState);
        break;
      case "on_chat_model_end":
        await handleChatModelEnd(eventStream$, streamState);
        break;
      case "on_tool_start":
        await handleToolStart(event, eventStream$, streamState);
        break;
      case "on_tool_end": {
        await handleToolEnd(event, eventStream$, streamState);
        break;
      }
      case "on_custom_event":
        // In direct LangGraph integration, custom events are typically application-specific
        // and don't map directly to CopilotKit runtime events, so we ignore them
        if (debug) {
          console.log("[LangGraph] Ignoring custom event:", event.name);
        }
        break;
      case "on_chain_start":
        await handleChainStart(event, streamState);
        break;
      default:
        if (debug) {
          console.log("[LangGraph] Ignoring event type:", event.event);
        }
        break;
    }
  } catch (error) {
    if (debug) {
      console.error("[LangGraph] Error handling event:", event.event, error);
    }
    // Use CopilotKit's standard error conversion
    const convertedError = convertServiceAdapterError(error, "LangGraph");
    eventStream$.next({
      type: RuntimeEventTypes.RunError,
      message: convertedError.message,
      code: "LANGGRAPH_EVENT_ERROR",
    });
  }
}

/**
 * Handle chat model stream events
 */
async function handleChatModelStream(
  event: StreamEvent,
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
): Promise<void> {
  const chunk = event.data?.chunk as AIMessageChunk;

  // Skip if finished
  if (chunk.response_metadata?.finish_reason) return;
  const messageContent = resolveMessageContent(chunk.content);
  const messageId = chunk.id || randomUUID();

  if (messageContent) {
    if (streamState.mode === "function" && streamState.idInProgress) {
      eventStream$.sendActionExecutionEnd({
        actionExecutionId: streamState.idInProgress,
      });
      streamState.mode = null;
      streamState.idInProgress = null;
    }

    if (streamState.mode === null) {
      streamState.mode = "message";
      streamState.idInProgress = messageId;
      eventStream$.sendTextMessageStart({
        messageId,
      });
    }

    if (streamState.mode === "message" && streamState.idInProgress) {
      eventStream$.sendTextMessageContent({
        messageId: streamState.idInProgress,
        content: messageContent,
      });
    }
  }
}

/**
 * Handle chat model end events
 */
async function handleChatModelEnd(
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
): Promise<void> {
  if (streamState.mode === "message" && streamState.idInProgress) {
    eventStream$.sendTextMessageEnd({
      messageId: streamState.idInProgress,
    });
    streamState.mode = null;
    streamState.idInProgress = null;
  }
}

/**
 * Handle chain start events
 */
async function handleChainStart(
  event: StreamEvent,
  streamState: StreamState,
): Promise<void> {
  if (
    event.metadata?.langgraph_node &&
    event.metadata.langgraph_node !== START
  ) {
    streamState.currentNodeName = event.metadata.langgraph_node;
  }
}

/**
 * Handle tool start events - when a tool begins execution
 */
async function handleToolStart(
  event: StreamEvent,
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
): Promise<void> {
  // Extract tool information from the start event
  const toolName = event.name || streamState.currentNodeName || "tool";
  const actionExecutionId = event.run_id || randomUUID();

  // Extract arguments from the input
  let argsStr = "";
  const inputAny = event.data?.input;
  try {
    if (typeof inputAny === "string") {
      argsStr = inputAny;
    } else if (inputAny && typeof inputAny === "object") {
      if ("input" in inputAny && typeof inputAny.input === "string") {
        argsStr = inputAny.input as string;
      } else {
        argsStr = JSON.stringify(inputAny);
      }
    }
  } catch {
    argsStr = "";
  }

  if (streamState.mode === "message" && streamState.idInProgress) {
    eventStream$.sendTextMessageEnd({
      messageId: streamState.idInProgress,
    });
    streamState.mode = null;
    streamState.idInProgress = null;
  }

  if (streamState.mode === null) {
    streamState.mode = "function";
  }

  if (streamState.mode === "function") {
    // Send action execution start event
    eventStream$.sendActionExecutionStart({
      actionExecutionId,
      actionName: toolName,
    });

    // Send action arguments - this will trigger the frontend to transition from 'inProgress' to 'executing'
    eventStream$.sendActionExecutionArgs({
      actionExecutionId,
      args: argsStr,
    });
    streamState.idInProgress = actionExecutionId;
  }
}

/**
 * Handle tool end events - when a tool completes execution
 */
async function handleToolEnd(
  event: StreamEvent,
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
): Promise<void> {
  if (streamState.mode === "function" && streamState.idInProgress) {
    const actionExecutionId = streamState.idInProgress;

    // Extract result from tool output
    const toolMessage = event.data?.output as ToolMessage;
    const result = toolMessage?.content || "";

    // Send action execution end event
    eventStream$.sendActionExecutionEnd({ actionExecutionId });

    // Send action execution result
    eventStream$.sendActionExecutionResult({
      actionExecutionId,
      actionName: streamState.currentNodeName || "tool",
      result: typeof result === "string" ? result : JSON.stringify(result),
    });
    streamState.mode = null;
    streamState.idInProgress = null;
  }
}

/**
 * Resolve message content from LangGraph message
 */
export function resolveMessageContent(content?: MessageContent): string | null {
  if (!content) return null;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content) && content.length) {
    const textContent = content.find(
      (c): c is { type: "text"; text: string } =>
        typeof c === "object" &&
        c !== null &&
        "type" in c &&
        c.type === "text" &&
        "text" in c,
    );
    return textContent?.text ?? null;
  }

  return null;
}
