/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

import type { ActionInputAvailability } from "../types/enums";

export class ActionInput {
  name: string = "";
  description: string = "";
  jsonSchema: string = "";
  available?: ActionInputAvailability;
}
