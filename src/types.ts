import type { BaseMessage } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { CompiledStateGraph } from "@langchain/langgraph";

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
export interface LangGraphServiceAdapterConfig {
  /** LangGraph agent instance */
  agent: AnyCompiledStateGraph;

  /** Debug mode */
  debug?: boolean;
}

/**
 * LangGraph input format for direct integration
 */
export interface LangGraphInput {
  messages: BaseMessage[];
  tools: DynamicStructuredTool[];
}

/**
 * Stream state for managing message and tool call states during LangGraph event processing
 *
 * This is necessary because:
 * - LangGraph's ThreadState is for graph state, not stream processing state
 * - We need to track complex streaming scenarios (concurrent messages, tool calls, node execution)
 * - Provides unified state management compared to scattered local variables
 */
export interface StreamState {
  /** Current run ID for this stream */
  runId: string;
  /** Map of run IDs to their in-progress message states */
  messagesInProgress: Map<string, MessageInProgress>;
  /** Currently executing LangGraph node name */
  currentNodeName?: string;
  /** Whether an error has occurred during processing */
  hasError: boolean;
}

/**
 * Message in progress state
 */
export interface MessageInProgress {
  id: string;
  toolCallId?: string | null;
  toolCallName?: string | null;
}
