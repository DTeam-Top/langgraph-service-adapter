/**
 * @jest-environment node
 */

import { CopilotRuntime, createLogger } from "@copilotkit/runtime";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
import type { ToolSpec } from "@langchain/core/utils/testing";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { type RuntimeEvent, RuntimeEventSubject } from "../src/internal/events";
import { MessageRole } from "../src/internal/graphql/types/enums";
import { LangGraphServiceAdapter } from "../src/langgraph-adapter";
import { createStreamState, handleLangGraphEvent } from "../src/utils";

describe("LangGraphServiceAdapter", () => {
  describe("CoAgent compatibility – actions in copilotkit state", () => {
    it("injects OpenAI tool specs into state and allows binding", async () => {
      const AgentStateAnnotation = Annotation.Root({
        ...MessagesAnnotation.spec,
        copilotkit: Annotation<{ actions: any[] }>(),
      });
      type AgentState = typeof AgentStateAnnotation.State;

      const fakeLLM = new FakeStreamingChatModel({
        responses: [new AIMessage({ content: "ok" })],
      });

      let observedToolSpecs: ToolSpec[] | null = null;

      async function chat_node(state: AgentState) {
        const actions = state.copilotkit?.actions ?? [];
        const toolSpecs: ToolSpec[] = actions
          .map((a: any) =>
            a?.type === "function" && a.function
              ? {
                  name: a.function.name,
                  description: a.function.description,
                  schema: a.function.parameters,
                }
              : null,
          )
          .filter(Boolean) as ToolSpec[];

        const modelWithTools = fakeLLM.bindTools(toolSpecs);
        observedToolSpecs = toolSpecs ?? null;
        await modelWithTools.invoke(state.messages);
        return {
          messages: [...state.messages, new AIMessage({ content: "done" })],
        };
      }

      const workflow = new StateGraph(AgentStateAnnotation)
        .addNode("chat_node", chat_node)
        .addEdge(START, "chat_node")
        .addEdge("chat_node", END)
        .compile();

      const adapter = new LangGraphServiceAdapter({ agent: workflow });
      const runtime = new CopilotRuntime();
      const graphqlContext = {
        request: {
          url: "http://localhost/test",
          headers: {},
          method: "POST",
        } as Request,
        params: {},
        waitUntil: () => {},
        _copilotkit: { runtime, serviceAdapter: adapter, endpoint: "/copilot" },
        properties: {},
        logger: createLogger({ level: "error" }),
      };

      const runtimeResponse = await runtime.processRuntimeRequest({
        serviceAdapter: adapter,
        messages: [
          {
            id: "m-1",
            createdAt: new Date(),
            textMessage: { role: MessageRole.user, content: "hi" },
          },
        ],
        actions: [
          {
            name: "AddVisitedDestination",
            description: "Add a visited destination",
            jsonSchema: JSON.stringify({
              type: "object",
              properties: { name: { type: "string" } },
              required: ["name"],
            }),
          },
        ],
        threadId: "coagent-compat-thread",
        outputMessagesPromise: Promise.resolve([]),
        graphqlContext,
      });

      await new Promise<void>((resolve, reject) => {
        const stream$ = runtimeResponse.eventSource.processRuntimeEvents({
          serverSideActions: runtimeResponse.serverSideActions,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          guardrailsResult$: null as any,
          actionInputsWithoutAgents: runtimeResponse.actionInputsWithoutAgents,
          threadId: "coagent-compat-thread",
        });
        const sub = stream$.subscribe({
          complete: () => {
            sub.unsubscribe();
            resolve();
          },
          error: (err) => {
            sub.unsubscribe();
            reject(err);
          },
        });
      });

      expect(Array.isArray(observedToolSpecs)).toBe(true);
      expect((observedToolSpecs as unknown as ToolSpec[]).length).toBe(1);
      expect((observedToolSpecs as unknown as ToolSpec[])[0]).toMatchObject({
        name: "AddVisitedDestination",
        description: "Add a visited destination",
        schema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      });
    });
  });

  describe("Event ordering – utils", () => {
    it("emits Start/Args/End without closing text message; anchors to parent", async () => {
      const eventStream$ = new RuntimeEventSubject();
      const streamState = createStreamState();

      const captured: RuntimeEvent[] = [];
      eventStream$.subscribe({ next: (e) => captured.push(e) });

      const startEvent = {
        event: "on_tool_start",
        run_id: "tool-run-1",
        name: "search",
        metadata: {},
        tags: [],
        data: {
          input: {
            input:
              '{"name":"NewYork","country":"USA","image":"https://example.com/xian.jpg","activities":"Play&Explore","description":"I love New York"}',
          },
        },
      } satisfies StreamEvent;

      await handleLangGraphEvent(startEvent, eventStream$, streamState, false);

      const endEvent = {
        event: "on_tool_end",
        run_id: "tool-run-1",
        name: "search",
        metadata: {},
        tags: [],
        data: {
          output: new ToolMessage({
            name: "search",
            content: "Search completed successfully",
            additional_kwargs: {},
            response_metadata: {},
            tool_call_id: "tool-call-1",
          }),
        },
      } satisfies StreamEvent;

      await handleLangGraphEvent(endEvent, eventStream$, streamState, false);

      const hasEarlyTextEnd = (captured as Array<{ type: string }>).some(
        (e) => e.type === "TextMessageEnd",
      );
      expect(hasEarlyTextEnd).toBe(false);

      const start = (
        captured as Array<{ type: string; actionName?: string }>
      ).find(
        (e) => e.type === "ActionExecutionStart" && e.actionName === "search",
      );
      expect(start).toBeTruthy();

      const assistantStartIndex = (
        captured as Array<{ type: string }>
      ).findIndex((e) => e.type === "TextMessageStart");
      const actionStartIndex = (captured as Array<{ type: string }>).findIndex(
        (e) => e.type === "ActionExecutionStart",
      );
      expect(actionStartIndex).toBeGreaterThan(assistantStartIndex);

      const args = (captured as Array<{ type: string; args?: string }>).find(
        (e) =>
          e.type === "ActionExecutionArgs" &&
          typeof e.args === "string" &&
          (e.args as string).includes("NewYork"),
      );
      expect(args).toBeTruthy();

      const end = (captured as Array<{ type: string }>).find(
        (e) => e.type === "ActionExecutionEnd",
      );
      expect(end).toBeTruthy();

      await handleLangGraphEvent(
        {
          event: "on_chat_model_end",
          run_id: "run-1",
          name: "model",
        } as StreamEvent,
        eventStream$,
        streamState,
        false,
      );
    });
  });
});
