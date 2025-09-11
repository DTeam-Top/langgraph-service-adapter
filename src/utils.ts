import { convertServiceAdapterError } from "@copilotkit/runtime";
import { randomUUID } from "@copilotkit/shared";
import type {
  AIMessageChunk,
  BaseMessage,
  MessageContent,
  ToolMessage,
} from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
import { START } from "@langchain/langgraph";
import { type RuntimeEventSubject, RuntimeEventTypes } from "./internal/events";
import type { ActionInput } from "./internal/graphql/inputs/action.input";
import type { Message } from "./internal/graphql/types/converted";
import {
  convertActionInputToLangChainTool,
  convertMessageToLangChainMessage,
} from "./internal/langchain/utils";
import type { LangGraphInput, MessageInProgress, StreamState } from "./types";

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

    const tools = actions
      .map((action) => convertActionInputToLangChainTool(action))
      .filter((tool): tool is DynamicStructuredTool => tool !== undefined);

    if (debug && tools.length > 0) {
      console.log(
        `[DEBUG] Converted ${tools.length} CopilotKit tools to LangGraph`,
      );
    }

    const result = {
      messages: langChainMessages,
      tools,
    };

    if (debug) {
      console.log("[DEBUG] LangGraphInput:", {
        messagesCount: result.messages.length,
        toolsCount: result.tools.length,
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
    messagesInProgress: new Map(),
    currentNodeName: undefined,
    hasError: false,
    // Track tool usage within the current run to control message emission
    hasToolActivity: false,
    lastActionExecutionId: undefined,
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

  const shouldEmitMessages =
    event.metadata?.["copilotkit:emit-messages"] ?? true;

  // Skip if finished
  if (chunk.response_metadata?.finish_reason) return;

  // Suppress assistant text once a tool call is present or has occurred in this run
  // This keeps the response tail on action messages so the frontend executes handlers.
  const toolCallChunks = chunk?.tool_call_chunks;
  const hasToolCallInChunk = toolCallChunks && toolCallChunks.length > 0;

  if (hasToolCallInChunk || streamState.hasToolActivity) {
    const inProgress = getMessageInProgress(streamState.runId, streamState);
    if (inProgress?.id && !inProgress.toolCallId) {
      // End any in-progress text to prevent trailing text
      eventStream$.sendTextMessageEnd({ messageId: inProgress.id });
      streamState.messagesInProgress.delete(streamState.runId);
    }
    return;
  }

  let currentStream = getMessageInProgress(streamState.runId, streamState);
  const hasCurrentStream = Boolean(currentStream?.id);

  const messageContent = resolveMessageContent(chunk.content);

  if (messageContent && shouldEmitMessages) {
    if (!hasCurrentStream || currentStream?.toolCallId) {
      const messageId = chunk.id || randomUUID();
      eventStream$.sendTextMessageStart({
        messageId: messageId,
      });

      setMessageInProgress(
        streamState.runId,
        {
          id: messageId,
          toolCallId: null,
          toolCallName: null,
        },
        streamState,
      );
      currentStream = getMessageInProgress(streamState.runId, streamState);
    }

    if (currentStream?.id) {
      eventStream$.sendTextMessageContent({
        messageId: currentStream.id,
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
  const currentStream = getMessageInProgress(streamState.runId, streamState);
  if (currentStream?.id) {
    eventStream$.sendTextMessageEnd({
      messageId: currentStream.id,
    });
  }

  streamState.messagesInProgress.delete(streamState.runId);
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

  // CRITICAL: If a text message is currently in progress, end it before starting tool execution
  // This prevents text streaming from interfering with tool execution UI
  const inProgress = getMessageInProgress(streamState.runId, streamState);
  if (inProgress?.id && !inProgress.toolCallId) {
    eventStream$.sendTextMessageEnd({ messageId: inProgress.id });
    streamState.messagesInProgress.delete(streamState.runId);
  }

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

  // Mark tool activity and store execution ID for the end event
  streamState.hasToolActivity = true;
  streamState.lastActionExecutionId = actionExecutionId;
}

/**
 * Handle tool end events - when a tool completes execution
 */
async function handleToolEnd(
  event: StreamEvent,
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
): Promise<void> {
  // Use the stored execution ID from tool start, or fall back to generating one
  const actionExecutionId =
    streamState.lastActionExecutionId || event.run_id || randomUUID();

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

/**
 * Get message in progress from stream state
 */
export function getMessageInProgress(
  runId: string,
  state: StreamState,
): MessageInProgress | null {
  return state.messagesInProgress.get(runId) || null;
}

/**
 * Set message in progress in stream state
 */
export function setMessageInProgress(
  runId: string,
  message: MessageInProgress,
  state: StreamState,
): void {
  state.messagesInProgress.set(runId, message);
}
