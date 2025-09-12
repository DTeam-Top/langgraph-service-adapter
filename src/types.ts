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
export interface LangGraphServiceAdapterConfig {
  /** LangGraph agent instance */
  agent: AnyCompiledStateGraph;

  /** Debug mode */
  debug?: boolean;

  /**
   * Specifies the strategy for handling the system prompt from the CopilotKit frontend.
   *
   * - **`passthrough` (default):** For agents without a built-in system prompt.
   *   The frontend's system prompt is passed directly to the agent as a `SystemMessage`.
   *
   * - **`inject`:** For agents that have their own system prompt defined via a template.
   *   The adapter intercepts the frontend's system prompt, removes it from the message list,
   *   and injects its content into the agent's prompt template via the `configurable`
   *   field under the key `copilotkit_instructions`.
   *
   * @example
   * ```typescript
   * // For an agent with its own prompt template
   * const serviceAdapter = new LangGraphServiceAdapter({
   *   agent: myTemplatedAgent,
   *   systemPromptStrategy: 'inject',
   * });
   * ```
   *
   * @default 'passthrough'
   */
  systemPromptStrategy?: "passthrough" | "inject";
}

/**
 * LangGraph input format for direct integration
 */
export interface LangGraphInput {
  messages: BaseMessage[];
  actions: ActionInput[];
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
  /** Whether any tool activity has occurred in this run */
  hasToolActivity: boolean;
  /** Last action execution id observed in this run */
  lastActionExecutionId?: string;
}

/**
 * Message in progress state
 */
export interface MessageInProgress {
  id: string;
  toolCallId?: string | null;
  toolCallName?: string | null;
}
