// Minimal telemetry client for compatibility
class TelemetryClient {
  capture(event: string, properties: Record<string, any> = {}): void {
    // No-op implementation for standalone package
    // In the original CopilotKit, this would send telemetry data
  }
}

export default new TelemetryClient();
