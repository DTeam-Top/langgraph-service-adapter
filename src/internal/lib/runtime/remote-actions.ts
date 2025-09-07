import type { Action } from "@copilotkit/shared";

export function isRemoteAgentAction(action: Action<any>): boolean {
  return !!(action as any).remoteAgentHandler;
}
