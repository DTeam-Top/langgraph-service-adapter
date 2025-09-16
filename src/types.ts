import type { BaseMessage } from "@langchain/core/messages";
import type { CompiledStateGraph } from "@langchain/langgraph";
import type { ActionInput } from "./internal/graphql/inputs/action.input";

/**
 * Type alias for any CompiledStateGraph instance
 * We use any for the generic parameters because our adapter needs to work
 * with graphs of any state structure, similar to LangGraph's own AnyStateGraph
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCompiledStateGraph = CompiledStateGraph<
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

/**
 * Configuration for LangGraphServiceAdapter
 */
export type LangGraphServiceAdapterConfig = {
  /** LangGraph agent instance */
  agent: AnyCompiledStateGraph;

  /** Debug mode */
  debug?: boolean;

  /**
   * Metadata to attach to each run. Compatible with CopilotKit LangGraphAgent run metadata.
   * @example
   * {
   *   "copilotkit:emit-messages": true,
   *   "copilotkit:emit-tool-calls": false,
   * }
   */
  metadata?: Record<string, unknown>;
};

/**
 * LangGraph input format for direct integration
 */
export type LangGraphInput = {
  messages: BaseMessage[];
  actions: ActionInput[];
};

/**
 * Stream state for managing message and tool call states during LangGraph event processing
 *
 * This is necessary because:
 * - LangGraph's ThreadState is for graph state, not stream processing state
 * - We need to track complex streaming scenarios (concurrent messages, tool calls, node execution)
 * - Provides unified state management compared to scattered local variables
 */
export type StreamState = {
  /** Current run ID for this stream */
  runId: string;
  /** Assistant message id used for the streaming text in this run (if any) */
  assistantMessageId?: string;
  /** Currently executing LangGraph node name (optional, for labeling) */
  currentNodeName?: string;
  /**
   * Whether the current stream contains any chat model streaming messages.
   */
  containsChatStreamingMessage?: boolean;
  /** Map LangGraph tool run_id -> emitted actionExecutionId */
  toolRunIdToActionId: Map<string, string>;
};
