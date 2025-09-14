import type {
  CopilotRuntimeChatCompletionRequest,
  CopilotRuntimeChatCompletionResponse,
  CopilotServiceAdapter,
} from "@copilotkit/runtime";
import { convertServiceAdapterError } from "@copilotkit/runtime";
import { randomUUID, tryMap } from "@copilotkit/shared";
import { isSystemMessage } from "@langchain/core/messages";
import type { RuntimeEventSubject } from "./internal/events";
import type { ActionInput } from "./internal/graphql/inputs/action.input";
import { convertRuntimeMessage } from "./internal/type-adapters";
import type { LangGraphInput, LangGraphServiceAdapterConfig } from "./types";
import {
  convertCopilotKitToLangGraphInput,
  createStreamState,
  handleLangGraphEvent,
} from "./utils";

/**
 * LangGraph ServiceAdapter for CopilotKit Runtime
 *
 * This adapter integrates local LangGraph agents (CompiledStateGraph) with CopilotKit,
 * providing full observability of agent execution through event streaming.
 *
 * Unlike the existing LangGraphAgent which works with remote LangGraph Platform,
 * this adapter works with local LangGraph agent instances.
 */
export class LangGraphServiceAdapter implements CopilotServiceAdapter {
  private agent: LangGraphServiceAdapterConfig["agent"];
  private debug: boolean;
  private systemPromptStrategy: "passthrough" | "inject";

  constructor(config: LangGraphServiceAdapterConfig) {
    this.agent = config.agent;
    this.debug = config.debug || false;
    this.systemPromptStrategy = config.systemPromptStrategy ?? "passthrough";

    if (this.debug) {
      console.log("[DEBUG] LangGraphServiceAdapter created with config:", {
        debug: this.debug,
        systemPromptStrategy: this.systemPromptStrategy,
      });
      console.log("[DEBUG] Agent type:", this.agent.constructor.name);
    }
  }

  async process(
    request: CopilotRuntimeChatCompletionRequest,
  ): Promise<CopilotRuntimeChatCompletionResponse> {
    const { eventSource, messages, actions, threadId, runId } = request;

    try {
      const internalMessages = messages.map((msg) =>
        convertRuntimeMessage(msg),
      );
      const langGraphInput = convertCopilotKitToLangGraphInput({
        messages: internalMessages,
        actions: actions,
        debug: this.debug,
      });

      // Decide which strategy to use for handling the system prompt.
      if (this.systemPromptStrategy === "inject") {
        // Filter out the system message and store its content.
        const filteredMessages = langGraphInput.messages.filter(
          (msg) => !isSystemMessage(msg),
        );

        // Update the input with the filtered messages.
        langGraphInput.messages = filteredMessages;

        if (this.debug) {
          console.log(
            "[DEBUG] 'inject' strategy active. Instructions extracted and messages filtered.",
          );
        }
      } else {
        // For 'passthrough' strategy, do nothing. The input is used as is.
        if (this.debug) {
          console.log(
            "[DEBUG] 'passthrough' strategy active. Passing all messages directly.",
          );
        }
      }

      // Process event stream
      eventSource.stream(async (eventStream$) => {
        await this.processLangGraphStream(langGraphInput, eventStream$, {
          runId,
        });
      });

      return {
        threadId: threadId || randomUUID(),
        runId,
      };
    } catch (error) {
      throw convertServiceAdapterError(error, "LangGraph");
    }
  }

  private async processLangGraphStream(
    input: LangGraphInput,
    eventStream$: RuntimeEventSubject,
    opts?: { runId?: string },
  ): Promise<void> {
    if (this.debug) {
      console.log("[DEBUG] === processLangGraphStream START ===");
      console.log("[DEBUG] LangGraph input:", {
        messagesCount: input.messages.length,
        actionsCount: input.actions.length,
        messages: input.messages.map((msg) => ({
          type: msg.constructor.name,
          content:
            typeof msg.content === "string"
              ? `${msg.content.substring(0, 100)}...`
              : msg.content,
        })),
        actions: input.actions,
      });
    }

    const streamState = createStreamState({ runId: opts?.runId });

    try {
      const eventStream = this.agent.streamEvents(
        {
          messages: input.messages,
          // Align with CoAgent behavior by passing JSON-serializable OpenAI tools
          // into state.copilotkit.actions so nodes can bind them directly.
          copilotkit: {
            // Use OpenAI tool spec shape so agent nodes can bind directly
            actions: tryMap(input.actions, (action: ActionInput) => ({
              type: "function",
              function: {
                name: action.name,
                description: action.description,
                parameters: JSON.parse(action.jsonSchema),
              },
            })),
          },
        },
        { version: "v2" },
      );

      if (this.debug) {
        console.log(
          "[DEBUG] StreamEvents created successfully, starting iteration...",
        );
      }

      let eventCount = 0;
      const eventTypes = new Map<string, number>();

      for await (const event of eventStream) {
        eventCount++;
        const eventType = event.event;
        eventTypes.set(eventType, (eventTypes.get(eventType) || 0) + 1);

        if (this.debug) {
          console.log(`[DEBUG] Event ${eventCount} (${eventType}):`, {
            event: event.event,
            run_id: event.run_id,
            metadata: event.metadata,
            data: event.data?.chunk
              ? {
                  chunk: {
                    id: event.data.chunk.id,
                    content: event.data.chunk.content,
                    tool_calls: event.data.chunk.tool_calls,
                    tool_call_chunks: event.data.chunk.tool_call_chunks,
                  },
                }
              : event.data,
          });
        }

        await handleLangGraphEvent(
          event,
          eventStream$,
          streamState,
          this.debug,
        );
      }

      if (this.debug) {
        console.log(`[DEBUG] Total events processed: ${eventCount}`);
        console.log(
          "[DEBUG] Event type distribution:",
          Object.fromEntries(eventTypes),
        );

        if (eventCount === 0) {
          console.warn(
            "[DEBUG] ⚠️  NO EVENTS PRODUCED! This might indicate an input format problem.",
          );
        }

        const chatModelStreamCount =
          eventTypes.get("on_chat_model_stream") || 0;
        if (chatModelStreamCount === 0) {
          console.warn(
            "[DEBUG] ⚠️  NO on_chat_model_stream EVENTS! This explains why there are no TextMessage events.",
          );
        } else {
          console.log(
            `[DEBUG] ✅ Found ${chatModelStreamCount} on_chat_model_stream events`,
          );
        }

        console.log("[DEBUG] === processLangGraphStream END ===");
      }
    } catch (error) {
      if (this.debug) {
        console.error("[DEBUG] Error in processLangGraphStream:", error);
        console.error("[LangGraph] Error during stream processing:", error);
      }
      throw convertServiceAdapterError(error, "LangGraph");
    } finally {
      eventStream$.complete();
    }
  }
}
