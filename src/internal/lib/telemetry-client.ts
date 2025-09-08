/**
 * This file is copied from CopilotKit source code.
 * Original source: https://github.com/CopilotKit/CopilotKit
 * License: MIT
 */

// Minimal telemetry client for compatibility
class TelemetryClient {
  capture(_event: string, _properties: Record<string, any> = {}): void {
    // No-op implementation for standalone package
    // In the original CopilotKit, this would send telemetry data
  }
}

export default new TelemetryClient();
