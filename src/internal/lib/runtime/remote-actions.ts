/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

import type { Action } from "@copilotkit/shared";

export function isRemoteAgentAction(action: Action<any>): boolean {
  return !!(action as any).remoteAgentHandler;
}
