/**
 * Stub: wire GSAP ScrollTrigger progress later without changing renderers.
 *
 * Example future usage:
 *   ScrollTrigger.create({ ..., onUpdate: (self) => engine.setProgress(self.progress) })
 */
export type GsapScrollAdapter = {
  /** progress 0..1 */
  getProgress(): number;
};

export function createGsapScrollAdapterStub(): GsapScrollAdapter {
  return {
    getProgress: () => 0,
  };
}
