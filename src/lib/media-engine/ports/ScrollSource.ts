/** Progress 0..1 from any scroll driver (Framer, GSAP, Lenis). */
export interface ScrollSource {
  getProgress(): number;
  subscribe(listener: (progress: number) => void): () => void;
}
