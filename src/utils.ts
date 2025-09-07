import { convertServiceAdapterError } from "@copilotkit/runtime";
import { randomId } from "@copilotkit/shared";
import type {
  AIMessageChunk,
  BaseMessage,
  MessageContent,
} from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
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
}: {
  messages: Message[];
  actions: ActionInput[];
  threadId?: string;
  runId?: string;
}): LangGraphInput {
  try {
    // Use CopilotKit existing message conversion
    // LangGraph accepts LangChain messages directly, no additional conversion needed
    const langChainMessages = messages
      .map(convertMessageToLangChainMessage)
      .filter((msg): msg is BaseMessage => msg !== undefined);

    // Use CopilotKit existing tool conversion
    const tools = actions
      .map(convertActionInputToLangChainTool)
      .filter((tool): tool is DynamicStructuredTool => tool !== undefined);

    return {
      messages: langChainMessages,
      tools,
      // Note: In direct LangGraph integration, threadId and runId are typically
      // handled through the streamEvents config parameter, not the input
    };
  } catch (error) {
    // Use CopilotKit's standard error conversion for input conversion errors
    throw convertServiceAdapterError(error, "LangGraph");
  }
}

/**
 * Create initial stream state for managing message and tool call states
 */
export function createStreamState(): StreamState {
  return {
    runId: randomId(),
    messagesInProgress: new Map(),
    currentNodeName: undefined,
    hasError: false,
  };
}

/**
 * Main event handler - directly processes LangGraph StreamEvents
 */
export async function handleLangGraphEvent(
  event: StreamEvent,
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
  debug = false,
): Promise<void> {
  try {
    if (debug) {
      console.log("[LangGraph] Processing event:", event.event, event);
    }

    // Set the runId for state management
    if (!streamState.runId && event.run_id) {
      streamState.runId = event.run_id;
    }

    // Direct LangGraph event processing - simplified approach
    switch (event.event) {
      case "on_chat_model_stream":
        await handleChatModelStream(event, eventStream$, streamState);
        break;
      case "on_chat_model_end":
        await handleChatModelEnd(event, eventStream$, streamState, debug);
        break;
      case "on_custom_event":
        // In direct LangGraph integration, custom events are typically application-specific
        // and don't map directly to CopilotKit runtime events, so we ignore them
        if (debug) {
          console.log("[LangGraph] Ignoring custom event:", event.name);
        }
        break;
      case "on_chain_start":
        await handleChainStart(event, eventStream$, streamState);
        break;
      case "on_chain_end":
        await handleChainEnd(event, eventStream$, streamState);
        break;
      default:
        // Ignore other event types
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
 * Handle chat model stream events - core thinking chain visualization
 */
async function handleChatModelStream(
  event: StreamEvent,
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
): Promise<void> {
  const chunk = event.data?.chunk as AIMessageChunk | undefined;
  if (!chunk) return;

  // Check event filtering metadata (optional - mainly for CopilotKit compatibility)
  // In direct LangGraph integration, these metadata fields may not be present
  const shouldEmitMessages =
    event.metadata?.["copilotkit:emit-messages"] ?? true;
  const shouldEmitToolCalls =
    event.metadata?.["copilotkit:emit-tool-calls"] ?? true;

  // Skip if finished
  if (chunk.response_metadata?.finish_reason) return;

  let currentStream = getMessageInProgress(streamState.runId, streamState);
  const hasCurrentStream = Boolean(currentStream?.id);

  // Handle tool calls - both tool_calls and tool_call_chunks formats
  const toolCall = chunk.tool_calls?.[0];
  const toolCallChunk = chunk.tool_call_chunks?.[0];

  if (toolCall && shouldEmitToolCalls) {
    if (!hasCurrentStream && toolCall.name) {
      // Tool call start
      eventStream$.sendActionExecutionStart({
        actionExecutionId: toolCall.id || randomId(),
        actionName: toolCall.name,
        parentMessageId: chunk.id,
      });

      setMessageInProgress(
        streamState.runId,
        {
          id: chunk.id || randomId(),
          toolCallId: toolCall.id || randomId(),
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

  // Note: In direct LangGraph integration, intermediate state prediction
  // is handled naturally through the LangGraph event flow rather than
  // artificial prediction events used in CopilotKit's LangGraphAgent

  if (toolCallChunk && shouldEmitToolCalls) {
    if (!hasCurrentStream && toolCallChunk.name) {
      // Tool call chunk start
      eventStream$.sendActionExecutionStart({
        actionExecutionId: toolCallChunk.id || randomId(),
        actionName: toolCallChunk.name,
        parentMessageId: chunk.id,
      });

      setMessageInProgress(
        streamState.runId,
        {
          id: chunk.id || randomId(),
          toolCallId: toolCallChunk.id || randomId(),
          toolCallName: toolCallChunk.name,
        },
        streamState,
      );
      return;
    }

    if (hasCurrentStream && currentStream?.toolCallId && toolCallChunk.args) {
      // Tool call chunk args
      eventStream$.sendActionExecutionArgs({
        actionExecutionId: currentStream.toolCallId,
        args: toolCallChunk.args,
      });
      return;
    }
  }

  // Handle text content - thinking process visualization
  const messageContent = resolveMessageContent(chunk.content);
  if (messageContent && shouldEmitMessages) {
    if (!hasCurrentStream || currentStream?.toolCallId) {
      // Start new text message
      const messageId = chunk.id || randomId();
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

    // Send text content - this shows the thinking process
    if (currentStream) {
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
  event: StreamEvent,
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
  debug = false,
): Promise<void> {
  const currentStream = getMessageInProgress(streamState.runId, streamState);

  if (currentStream?.toolCallId) {
    // End tool call
    eventStream$.sendActionExecutionEnd({
      actionExecutionId: currentStream.toolCallId,
    });

    if (debug) {
      console.log("[LangGraph] Ended tool call:", {
        toolCallId: currentStream.toolCallId,
        toolCallName: currentStream.toolCallName,
        eventOutput: event.data?.output,
      });
    }
  } else if (currentStream?.id) {
    // End text message
    eventStream$.sendTextMessageEnd({
      messageId: currentStream.id,
    });

    if (debug) {
      console.log("[LangGraph] Ended text message:", {
        messageId: currentStream.id,
        eventOutput: event.data?.output,
      });
    }
  } else {
    // No current stream - this might indicate a logic issue or an edge case
    // The event.data.output contains the final model output, but we don't have
    // a corresponding stream to end. This could happen if:
    // 1. The model produced output without streaming chunks
    // 2. There was an error in our stream tracking
    // 3. This is a valid edge case we should handle

    if (debug) {
      console.warn(
        "[LangGraph] ChatModelEnd event without corresponding stream:",
        {
          runId: streamState.runId,
          eventRunId: event.run_id,
          eventData: event.data,
        },
      );
    }
  }

  // Clean up state
  streamState.messagesInProgress.delete(streamState.runId);
}

/**
 * Handle chain start events - node state visualization
 */
async function handleChainStart(
  event: StreamEvent,
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
): Promise<void> {
  // Show node execution state for visualization
  if (
    event.metadata?.langgraph_node &&
    event.metadata.langgraph_node !== "__start__"
  ) {
    streamState.currentNodeName = event.metadata.langgraph_node;

    eventStream$.sendAgentStateMessage({
      threadId: streamState.runId,
      agentName: "LangGraph",
      nodeName: event.metadata.langgraph_node,
      runId: event.run_id,
      active: true,
      role: "agent",
      state: "starting",
      running: true,
    });
  }
}

/**
 * Handle chain end events - node state visualization
 */
async function handleChainEnd(
  event: StreamEvent,
  eventStream$: RuntimeEventSubject,
  streamState: StreamState,
): Promise<void> {
  // Update node execution state
  if (
    event.metadata?.langgraph_node &&
    event.metadata.langgraph_node !== "__end__"
  ) {
    eventStream$.sendAgentStateMessage({
      threadId: streamState.runId,
      agentName: "LangGraph",
      nodeName: event.metadata.langgraph_node,
      runId: event.run_id,
      active: false,
      role: "agent",
      state: "completed",
      running: false,
    });
  }
}

/**
 * Resolve message content from LangGraph message
 * Ported from AG-UI utils.ts
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
