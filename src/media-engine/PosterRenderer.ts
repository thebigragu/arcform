import { drawCover } from "./coverDraw";
import { resizeBackingStore } from "./resizeBackingStore";

export class PosterRenderer {
  readonly id = "poster" as const;
  private img: HTMLImageElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private drawn = false;

  constructor(private posterUrl: string) {}

  async init(canvas: HTMLCanvasElement, maxDpr: number) {
    this.canvas = canvas;
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = this.posterUrl;
    });
    this.img = img;
    this.resize(
      canvas.clientWidth || canvas.width,
      canvas.clientHeight || canvas.height,
      maxDpr,
    );
    this.present();
  }

  present() {
    if (this.drawn) return false;
    const canvas = this.canvas;
    const img = this.img;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !img || !ctx || !img.naturalWidth) return false;
    drawCover(
      ctx,
      img,
      img.naturalWidth,
      img.naturalHeight,
      canvas.width,
      canvas.height,
    );
    this.drawn = true;
    return true;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    if (!this.canvas) return;
    const sw = this.img?.naturalWidth || 1;
    const sh = this.img?.naturalHeight || 1;
    resizeBackingStore(this.canvas, cssW, cssH, dpr, sw, sh);
    this.drawn = false;
  }

  dispose() {
    this.img = null;
    this.canvas = null;
  }
}
