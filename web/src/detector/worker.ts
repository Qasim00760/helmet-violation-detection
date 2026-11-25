/// <reference lib="webworker" />
import * as ort from "onnxruntime-web/wasm";
import { decode, letterbox, rgbaToChw } from "./geometry";

ort.env.wasm.numThreads = 1;

const MODEL_URL = "/models/helmet-yolov8l.onnx";
let session: ort.InferenceSession | null = null;

async function loadModel() {
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total) postMessage({ type: "progress", value: loaded / total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
  postMessage({ type: "ready" });
}

const ready = loadModel().catch((e: Error) => postMessage({ type: "error", message: e.message }));

self.onmessage = async (e: MessageEvent<{ id: number; bitmap: ImageBitmap; conf: number }>) => {
  const { id, bitmap, conf } = e.data;
  try {
    await ready;
    if (!session) throw new Error("The model is not loaded.");
    const t0 = performance.now();
    const lb = letterbox(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(lb.size, lb.size);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "rgb(114,114,114)";
    ctx.fillRect(0, 0, lb.size, lb.size);
    ctx.drawImage(bitmap, lb.padX, lb.padY, lb.newW, lb.newH);
    const input = rgbaToChw(ctx.getImageData(0, 0, lb.size, lb.size).data, lb.size);
    const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, lb.size, lb.size]) };
    const out = (await session.run(feeds))[session.outputNames[0]];
    const detections = decode(out.data as Float32Array, out.dims[2], lb, bitmap.width, bitmap.height, conf);
    postMessage({ type: "result", id, detections, ms: performance.now() - t0 });
  } catch (err) {
    postMessage({ type: "error", id, message: (err as Error).message });
  } finally {
    bitmap.close();
  }
};
