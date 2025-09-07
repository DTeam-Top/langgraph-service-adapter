export interface AgentStateInput {
  agentName: string;
  threadId: string;
  runId: string;
  nodeName: string;
  active: boolean;
  running: boolean;
  state: any;
}
