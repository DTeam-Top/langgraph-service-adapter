import type { CopilotRuntimeChatCompletionRequest } from "@copilotkit/runtime";

export type RuntimeEventSource =
  CopilotRuntimeChatCompletionRequest["eventSource"];

// Extract the actual ActionInput class type from the runtime request
export type ActionInput =
  CopilotRuntimeChatCompletionRequest["actions"][number];

// Extract RuntimeEventSubject type from the eventSource.stream callback parameter
export type RuntimeEventSubject = Parameters<
  Parameters<CopilotRuntimeChatCompletionRequest["eventSource"]["stream"]>[0]
>[0];

export type Message = CopilotRuntimeChatCompletionRequest["messages"][number];
