import type { Detection } from "./detector/types";

type Worker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
let worker: Promise<Worker> | null = null;

/** Load Tesseract on first use only; it pulls about 10 MB of language data. */
function getWorker() {
  worker ??= import("tesseract.js").then(async ({ createWorker, PSM }) => {
    const w = await createWorker("eng", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr",
      langPath: "/ocr",
      gzip: true,
    });
    await w.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });
    return w;
  });
  return worker;
}

/** Crop a box from the image, upscale small plates and boost contrast before OCR. */
export function cropToCanvas(img: HTMLImageElement, d: Detection, pad = 0.08, minWidth = 0): HTMLCanvasElement {
  const px = d.w * pad, py = d.h * pad;
  const x = Math.max(0, d.x - px), y = Math.max(0, d.y - py);
  const w = Math.min(img.naturalWidth - x, d.w + 2 * px), h = Math.min(img.naturalHeight - y, d.h + 2 * py);
  const scale = minWidth && w < minWidth ? minWidth / w : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

export async function readPlate(img: HTMLImageElement, plate: Detection): Promise<{ text: string; confidence: number }> {
  const crop = cropToCanvas(img, plate, 0.06, 320);
  const ctx = crop.getContext("2d")!;
  const data = ctx.getImageData(0, 0, crop.width, crop.height);
  for (let i = 0; i < data.data.length; i += 4) {           // grayscale with a contrast stretch
    const g = 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.6 + 128));
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  const w = await getWorker();
  const { data: r } = await w.recognize(crop);
  const text = r.text.replace(/[^A-Z0-9-]/g, "").trim();
  return { text, confidence: text ? r.confidence / 100 : 0 };
}
