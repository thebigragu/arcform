/**
 * Gate 1 cold-start telemetry — debug overlay only, lightweight counters.
 */
export class ColdStartTelemetry {
  posterHintUrl: string | null = null;
  posterRuntimeUrl: string | null = null;
  frame0HintUrl: string | null = null;
  frame0RuntimeUrl: string | null = null;

  tierCommittedAt: number | null = null;
  manifestRequestStart: number | null = null;
  manifestRequestEnd: number | null = null;
  posterRequestStart: number | null = null;
  posterRequestEnd: number | null = null;
  frame0RequestStart: number | null = null;
  frame0RequestEnd: number | null = null;
  frame0DecodeStart: number | null = null;
  frame0DecodeEnd: number | null = null;
  firstCanvasDrawAt: number | null = null;
  posterHiddenAt: number | null = null;
  firstInteractionAt: number | null = null;

  startupNetworkRequests = 0;
  startupDecodes = 0;
  startupDedupePrevented = 0;

  noteManifestStart() {
    if (this.manifestRequestStart == null) {
      this.manifestRequestStart = performance.now();
    }
  }

  noteManifestEnd() {
    if (this.manifestRequestEnd == null) {
      this.manifestRequestEnd = performance.now();
    }
    this.startupNetworkRequests += 1;
  }

  notePosterRuntimeStart(url: string) {
    this.posterRuntimeUrl = url;
    if (this.posterRequestStart == null) {
      this.posterRequestStart = performance.now();
    }
  }

  notePosterRuntimeEnd() {
    if (this.posterRequestEnd == null) {
      this.posterRequestEnd = performance.now();
    }
  }

  noteFrame0Runtime(url: string) {
    this.frame0RuntimeUrl = url;
    if (this.frame0RequestStart == null) {
      this.frame0RequestStart = performance.now();
    }
  }

  noteFrame0RequestEnd() {
    if (this.frame0RequestEnd == null) {
      this.frame0RequestEnd = performance.now();
    }
    this.startupNetworkRequests += 1;
  }

  noteFrame0DecodeStart() {
    if (this.frame0DecodeStart == null) {
      this.frame0DecodeStart = performance.now();
    }
  }

  noteFrame0DecodeEnd() {
    if (this.frame0DecodeEnd == null) {
      this.frame0DecodeEnd = performance.now();
    }
    this.startupDecodes += 1;
  }

  noteFirstCanvasDraw() {
    if (this.firstCanvasDrawAt == null) {
      this.firstCanvasDrawAt = performance.now();
    }
  }

  notePosterHidden() {
    if (this.posterHiddenAt == null) {
      this.posterHiddenAt = performance.now();
    }
  }

  noteFirstInteraction() {
    if (this.firstInteractionAt == null) {
      this.firstInteractionAt = performance.now();
    }
  }

  noteStartupDedupe(n = 1) {
    this.startupDedupePrevented += n;
  }

  posterUrlMatch(): boolean | null {
    if (!this.posterHintUrl || !this.posterRuntimeUrl) return null;
    return this.posterHintUrl === this.posterRuntimeUrl;
  }

  frame0UrlMatch(): boolean | null {
    if (!this.frame0HintUrl || !this.frame0RuntimeUrl) return null;
    // No static frame-0 hint by design — runtime-only warm path
    if (this.frame0HintUrl === "none") return true;
    return this.frame0HintUrl === this.frame0RuntimeUrl;
  }

  snapshot() {
    return {
      posterHintUrl: this.posterHintUrl,
      posterRuntimeUrl: this.posterRuntimeUrl,
      posterUrlMatch: this.posterUrlMatch(),
      frame0HintUrl: this.frame0HintUrl ?? "none",
      frame0RuntimeUrl: this.frame0RuntimeUrl,
      frame0UrlMatch: this.frame0UrlMatch(),
      tierCommittedAt: this.tierCommittedAt,
      manifestRequestStart: this.manifestRequestStart,
      manifestRequestEnd: this.manifestRequestEnd,
      posterRequestStart: this.posterRequestStart,
      posterRequestEnd: this.posterRequestEnd,
      frame0RequestStart: this.frame0RequestStart,
      frame0RequestEnd: this.frame0RequestEnd,
      frame0DecodeStart: this.frame0DecodeStart,
      frame0DecodeEnd: this.frame0DecodeEnd,
      firstCanvasDrawAt: this.firstCanvasDrawAt,
      posterHiddenAt: this.posterHiddenAt,
      firstInteractionAt: this.firstInteractionAt,
      startupNetworkRequests: this.startupNetworkRequests,
      startupDecodes: this.startupDecodes,
      startupDedupePrevented: this.startupDedupePrevented,
    };
  }
}

export const coldStartTelemetry = new ColdStartTelemetry();
