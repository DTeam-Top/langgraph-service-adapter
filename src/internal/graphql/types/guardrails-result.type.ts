export interface GuardrailsResult {
  status: "allowed" | "denied" | "pending";
  reason?: string;
}
