import type { ScrollSource } from "../ports/ScrollSource";

type MotionLike = {
  get(): number;
  on(event: "change", cb: (v: number) => void): () => void;
};

/** Framer MotionValue → ScrollSource. */
export function fromMotionValue(mv: MotionLike): ScrollSource {
  return {
    getProgress: () => mv.get(),
    subscribe: (listener) => mv.on("change", listener),
  };
}

export class ScrollSynchronizer {
  constructor(private source: ScrollSource) {}

  getProgress() {
    return this.source.getProgress();
  }

  subscribe(listener: (progress: number) => void) {
    return this.source.subscribe(listener);
  }

  static fromMotionValue(mv: MotionLike) {
    return new ScrollSynchronizer(fromMotionValue(mv));
  }
}
