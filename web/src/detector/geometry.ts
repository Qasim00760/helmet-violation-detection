import { CLASS_NAMES, type Detection, type Letterbox } from "./types";

/** Same letterbox as Ultralytics: keep aspect ratio, centre the image, pad the rest. */
export function letterbox(width: number, height: number, size = 640): Letterbox & { newW: number; newH: number } {
  const scale = Math.min(size / width, size / height);
  const newW = Math.round(width * scale);
  const newH = Math.round(height * scale);
  return { size, scale, newW, newH, padX: Math.max(0, Math.round((size - newW) / 2 - 0.1)), padY: Math.max(0, Math.round((size - newH) / 2 - 0.1)) };
}

/** Pack RGBA pixels of the letterboxed canvas into a 1x3xSxS float tensor in [0, 1]. */
export function rgbaToChw(rgba: Uint8ClampedArray | Uint8Array, size: number): Float32Array {
  const area = size * size;
  const out = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    out[i] = rgba[i * 4] / 255;
    out[area + i] = rgba[i * 4 + 1] / 255;
    out[2 * area + i] = rgba[i * 4 + 2] / 255;
  }
  return out;
}

export function iou(a: Detection, b: Detection): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Decode YOLOv8 output [1, 4 + classes, anchors] into boxes in original image pixels,
 * then run non-maximum suppression. "Helmet" and "No helmet" share a group, so one
 * head can never be reported as both.
 */
export function decode(
  output: Float32Array,
  anchors: number,
  lb: Letterbox,
  imageW: number,
  imageH: number,
  confThreshold = 0.25,
  iouThreshold = 0.5,
): Detection[] {
  const nc = CLASS_NAMES.length;
  const candidates: Detection[] = [];
  for (let a = 0; a < anchors; a++) {
    let best = 0;
    let cls = 0;
    for (let c = 0; c < nc; c++) {
      const s = output[(4 + c) * anchors + a];
      if (s > best) { best = s; cls = c; }
    }
    if (best < confThreshold) continue;
    const cx = (output[a] - lb.padX) / lb.scale;
    const cy = (output[anchors + a] - lb.padY) / lb.scale;
    const w = output[2 * anchors + a] / lb.scale;
    const h = output[3 * anchors + a] / lb.scale;
    const x = Math.max(0, cx - w / 2);
    const y = Math.max(0, cy - h / 2);
    candidates.push({
      x, y,
      w: Math.min(imageW, cx + w / 2) - x,
      h: Math.min(imageH, cy + h / 2) - y,
      score: best,
      cls: CLASS_NAMES[cls],
    });
  }
  return nms(candidates, iouThreshold);
}

const group = (d: Detection) => (d.cls === "with_helmet" || d.cls === "without_helmet" ? "head" : d.cls);

export function nms(boxes: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...boxes].sort((p, q) => q.score - p.score);
  const kept: Detection[] = [];
  for (const box of sorted) {
    if (kept.every((k) => group(k) !== group(box) || iou(k, box) < iouThreshold)) kept.push(box);
  }
  return kept;
}
