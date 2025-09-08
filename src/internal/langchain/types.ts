/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

import type { BaseMessage } from "@langchain/core/messages";

export type LangChainReturnType = string | BaseMessage | ReadableStream | any;
