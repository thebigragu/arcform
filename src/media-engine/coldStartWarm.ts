import { coldStartTelemetry } from "./ColdStartTelemetry";

/**
 * Warm selected-tier frame 0 over the network after tier commit.
 * Does not decode — SequenceScrub bootstrap handles decode within budget.
 */
export async function warmCommittedFrame0(url: string): Promise<void> {
  coldStartTelemetry.noteFrame0Runtime(url);
  try {
    await fetch(url, {
      cache: "force-cache",
      priority: "high",
    } as RequestInit);
    coldStartTelemetry.noteFrame0RequestEnd();
  } catch {
    coldStartTelemetry.noteFrame0RequestEnd();
  }
}
