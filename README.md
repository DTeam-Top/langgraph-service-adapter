# LangGraph Service Adapter

A standalone service adapter for integrating LangGraph agents with CopilotKit runtime. This package allows you to use local LangGraph agents as service adapters in CopilotKit applications.

## Features

- 🤖 **LangGraph Integration**: Seamlessly integrate LangGraph agents with CopilotKit
- 🔄 **Streaming Support**: Full support for streaming responses and real-time updates
- 🛠️ **Tool Calling**: Native support for LangChain tools and function calling
- 📝 **TypeScript**: Full TypeScript support with comprehensive type definitions
- 🎯 **Event Handling**: Robust event processing and error handling
- 🔧 **Configurable**: Flexible configuration options for different use cases

## Installation

```bash
npm install https://github.com/DTeam-Top/langgraph-service-adapter.git
# or
pnpm add https://github.com/DTeam-Top/langgraph-service-adapter.git
# or
yarn add https://github.com/DTeam-Top/langgraph-service-adapter.git
```

### Peer Dependencies

This package requires `@copilotkit/runtime` as a peer dependency:

```bash
npm install @copilotkit/runtime
```

## Quick Start

```typescript
import { LangGraphServiceAdapter } from "langgraph-service-adapter";
import { StateGraph } from "@langchain/langgraph";
import { CopilotRuntime } from "@copilotkit/runtime";

// Create your LangGraph agent
const workflow = new StateGraph({
  // Your graph definition
});

const agent = workflow.compile();

// Create the service adapter
const serviceAdapter = new LangGraphServiceAdapter({
  agent,
  debug: true, // Optional: enable debug logging
});

// Use with CopilotRuntime
const runtime = new CopilotRuntime({
  serviceAdapter,
});
```

## API Reference

### LangGraphServiceAdapter

The main adapter class that implements the CopilotKit service adapter interface.

#### Constructor

```typescript
new LangGraphServiceAdapter(config: LangGraphServiceAdapterConfig)
```

#### Configuration

```typescript
interface LangGraphServiceAdapterConfig {
  /** LangGraph agent instance */
  agent: AnyCompiledStateGraph;
  /** Debug mode (optional) */
  debug?: boolean;
  /** Metadata (optional) */
  metadata?: Record<string, unknown>;
}
```

### Types

#### AnyCompiledStateGraph

```typescript
type AnyCompiledStateGraph = CompiledStateGraph<
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;
```

A type alias for any CompiledStateGraph instance from LangGraph.

#### LangGraphInput

```typescript
interface LangGraphInput {
  messages: BaseMessage[];
  tools: DynamicStructuredTool[];
}
```

Input format for LangGraph processing.

#### StreamState

```typescript
interface StreamState {
  runId: string;
  messagesInProgress: Map<string, MessageInProgress>;
  currentNodeName?: string;
  hasError: boolean;
}
```

Internal state management for streaming operations.

## Usage Examples

### Basic Agent Setup

```typescript
import { LangGraphServiceAdapter } from "langgraph-service-adapter";
import { StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

// Define your agent state
interface AgentState {
  messages: BaseMessage[];
}

// Create a simple agent
const model = new ChatOpenAI({ temperature: 0 });

const workflow = new StateGraph<AgentState>({
  channels: {
    messages: {
      value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
      default: () => [],
    },
  },
});

workflow.addNode("agent", async (state: AgentState) => {
  const response = await model.invoke(state.messages);
  return { messages: [response] };
});

workflow.addEdge("agent", END);
workflow.setEntryPoint("agent");

const agent = workflow.compile();

// Create service adapter
const serviceAdapter = new LangGraphServiceAdapter({
  agent,
  debug: process.env.NODE_ENV === "development",
});
```

### With Tool Calling

```typescript
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Define tools
const weatherTool = new DynamicStructuredTool({
  name: "get_weather",
  description: "Get current weather for a location",
  schema: z.object({
    location: z.string().describe("The location to get weather for"),
  }),
  func: async ({ location }) => {
    // Your weather API call
    return `Weather in ${location}: Sunny, 72°F`;
  },
});

// Your agent setup with tools
const agentWithTools = createAgentWithTools([weatherTool]);

const serviceAdapter = new LangGraphServiceAdapter({
  agent: agentWithTools,
});
```

### Error Handling

```typescript
import { LangGraphServiceAdapter } from "langgraph-service-adapter";

try {
  const serviceAdapter = new LangGraphServiceAdapter({
    agent: myAgent,
    debug: true,
  });

  // Use the adapter...
} catch (error) {
  console.error("Failed to create service adapter:", error);
}
```

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

### Linting

```bash
pnpm lint
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0
- @copilotkit/runtime ^1.10.0

## Dependencies

This package depends on:

- `@copilotkit/shared`: Shared utilities from CopilotKit
- `@langchain/core`: Core LangChain functionality
- `@langchain/langgraph`: LangGraph framework
- `langchain`: Main LangChain library
- `class-transformer`: Object transformation utilities
- `rxjs`: Reactive extensions for JavaScript
- `zod`: TypeScript-first schema validation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

### Attribution

This project includes code derived from [CopilotKit](https://github.com/CopilotKit/CopilotKit), which is licensed under the MIT License. The `internal/` directory contains code copied from CopilotKit source code to provide compatibility and functionality.

## Related Projects

- [CopilotKit](https://github.com/CopilotKit/CopilotKit) - The main CopilotKit framework
- [LangGraph](https://github.com/langchain-ai/langgraphjs) - Build stateful, multi-actor applications with LLMs
- [LangChain](https://github.com/langchain-ai/langchainjs) - Building applications with LLMs through composability

## Support

For questions and support:

- [GitHub Issues](https://github.com/your-org/langgraph-service-adapter/issues)
- [CopilotKit Documentation](https://docs.copilotkit.ai/)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
