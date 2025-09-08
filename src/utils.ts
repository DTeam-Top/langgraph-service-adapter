import { convertServiceAdapterError } from "@copilotkit/runtime";
import { randomUUID } from "@copilotkit/shared";
import type {
  AIMessageChunk,
  BaseMessage,
  MessageContent,
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
  const chunk = event.data?.chunk as AIMessageChunk | undefined;
  if (!chunk) {
    return;
  }

  const shouldEmitMessages =
    event.metadata?.["copilotkit:emit-messages"] ?? true;
  const shouldEmitToolCalls =
    event.metadata?.["copilotkit:emit-tool-calls"] ?? true;

  // Skip if finished
  if (chunk.response_metadata?.finish_reason) return;

  let currentStream = getMessageInProgress(streamState.runId, streamState);
  const hasCurrentStream = Boolean(currentStream?.id);

  const toolCall = chunk.tool_calls?.[0];

  if (toolCall && shouldEmitToolCalls) {
    if (!hasCurrentStream && toolCall.name) {
      // Tool call start
      eventStream$.sendActionExecutionStart({
        actionExecutionId: toolCall.id || randomUUID(),
        actionName: toolCall.name,
        parentMessageId: chunk.id,
      });

      setMessageInProgress(
        streamState.runId,
        {
          id: chunk.id || randomUUID(),
          toolCallId: toolCall.id || randomUUID(),
          toolCallName: toolCall.name,
        },
        streamState,
      );
      return;
    }

    if (hasCurrentStream && currentStream?.toolCallId && toolCall.args) {
      // Tool call args
      eventStream$.sendActionExecutionArgs({
        actionExecutionId: currentStream.toolCallId,
        args: JSON.stringify(toolCall.args),
      });
      return;
    }
  }

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

  if (currentStream?.toolCallId) {
    eventStream$.sendActionExecutionEnd({
      actionExecutionId: currentStream.toolCallId,
    });
  } else if (currentStream?.id) {
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
