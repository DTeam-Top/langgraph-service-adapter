import type { ActionInputAvailability } from "../types/enums";

export class ActionInput {
  name: string = "";
  description: string = "";
  jsonSchema: string = "";
  available?: ActionInputAvailability;
}
