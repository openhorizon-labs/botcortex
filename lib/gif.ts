/**
 * Record a canvas to a GIF, in the tab.
 *
 * A GIF and not a video on purpose: it is the one moving-image format that
 * plays inline everywhere a robot clip gets shared — a Discord message, a
 * GitHub issue, a forum post — with nothing to click.
 *
 * Frames are encoded AS THEY ARE CAPTURED. Holding raw frames until the end
 * is the obvious design and it is 690 KB a frame at this size: a 30-second
 * run is 200 MB of pixels waiting for an encoder. Encoding on capture keeps
 * only the compressed bytes.
 *
 * One palette for the whole clip, taken from the first frame. The workcell is
 * a fixed set of colours — the bench, three blocks, the arm — so a palette per
 * frame buys nothing, costs a quantisation per frame, and makes flat greys
 * shimmer as neighbouring frames round them differently.
 *
 * Frames are PUSHED by the viewer, from inside its own render call (see
 * `tapFrames`), not pulled by a timer here. A WebGL canvas only holds its
 * picture until the browser composites it, so a timer reading it later needs
 * `preserveDrawingBuffer` — which makes the browser copy a full retina buffer
 * on every frame instead of swapping it, and a read that lands between frames
 * stalls the GPU. On the public player that showed up as the scene flickering
 * and vanishing while a skill ran. Copying in the same call that drew the
 * frame needs neither.
 */
import { GIFEncoder, applyPalette, quantize, type Palette } from "gifenc";

export type GifOptions = {
  /** Output width in pixels; height follows the canvas's aspect. */
  width?: number;
  fps?: number;
  /** A hard stop, so a run that never ends cannot fill memory. */
  maxSeconds?: number;
  /** Painted behind the frame: a WebGL canvas with alpha reads back
   *  transparent where nothing was drawn, and GIF has no partial alpha. */
  background?: string;
};

/** The one live viewer's frame hook. There is only ever one 3D viewer on a
 *  page, so this is a slot, not a registry. */
let tap: ((canvas: HTMLCanvasElement) => void) | null = null;

/** Called by the viewer right after it renders a frame. Costs one null check
 *  when nothing is recording. */
export function tapFrames(canvas: HTMLCanvasElement) {
  tap?.(canvas);
}

export type GifRecording = {
  /** Stops capturing and returns the clip, or null if no frame was captured. */
  stop(): Blob | null;
  readonly frames: number;
};

/** Output size for a source canvas: `width` wide, aspect kept, even numbers. */
export function gifSize(sourceWidth: number, sourceHeight: number, width: number): [number, number] {
  if (sourceWidth <= 0 || sourceHeight <= 0) return [0, 0];
  const w = Math.max(2, Math.round(Math.min(width, sourceWidth) / 2) * 2);
  const h = Math.max(2, Math.round((w * sourceHeight) / sourceWidth / 2) * 2);
  return [w, h];
}

export function recordCanvas(options: GifOptions = {}): GifRecording {
  const { width = 480, fps = 10, maxSeconds = 45, background = "#d9d9dd" } = options;
  const delay = Math.round(1000 / fps);
  const encoder = GIFEncoder();
  const scratch = document.createElement("canvas");
  const context = scratch.getContext("2d", { willReadFrequently: true });
  let palette: Palette | null = null;
  let frames = 0;
  let stopped = false;
  let due = 0;

  const capture = (source: HTMLCanvasElement) => {
    const now = performance.now();
    // The viewer renders at the display's rate; the clip wants `fps`.
    if (stopped || !context || source.width === 0 || now < due) return;
    due = now + delay;
    if (frames === 0) [scratch.width, scratch.height] = gifSize(source.width, source.height, width);
    if (scratch.width === 0) return;
    context.fillStyle = background;
    context.fillRect(0, 0, scratch.width, scratch.height);
    context.drawImage(source, 0, 0, scratch.width, scratch.height);
    const { data } = context.getImageData(0, 0, scratch.width, scratch.height);
    palette ??= quantize(data, 256, { format: "rgb444" });
    encoder.writeFrame(applyPalette(data, palette, "rgb444"), scratch.width, scratch.height, {
      palette: frames === 0 ? palette : undefined,
      delay,
      repeat: 0,
    });
    frames += 1;
    if (frames >= maxSeconds * fps) finish();
  };

  const finish = () => {
    stopped = true;
    if (tap === capture) tap = null;
  };
  tap = capture;

  return {
    get frames() {
      return frames;
    },
    stop() {
      finish();
      if (frames === 0) return null;
      encoder.finish();
      return new Blob([encoder.bytes() as BlobPart], { type: "image/gif" });
    },
  };
}
