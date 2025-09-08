/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

export interface AgentStateInput {
  agentName: string;
  threadId: string;
  runId: string;
  nodeName: string;
  active: boolean;
  running: boolean;
  state: any;
}
