/// <reference lib="webworker" />
import * as ort from "onnxruntime-web/webgpu";
import { decode, letterbox, rgbaToChw } from "./geometry";

ort.env.wasm.numThreads = 1;

const MODEL_URL = "/models/helmet-yolov8l.onnx";
let session: ort.InferenceSession | null = null;
let backend: "webgpu" | "wasm" = "wasm";

async function download(): Promise<Uint8Array> {
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
  return bytes;
}

/** Use the GPU through WebGPU when the browser has it; otherwise WebAssembly on the CPU. */
async function loadModel() {
  const bytes = await download();
  const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu && (await gpu.requestAdapter().catch(() => null))) {
    try {
      session = await ort.InferenceSession.create(bytes, { executionProviders: ["webgpu"] });
      backend = "webgpu";
    } catch { session = null; }
  }
  if (!session) {
    session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
    backend = "wasm";
  }
  postMessage({ type: "ready", backend });
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
    const data = (out.data ?? (await out.getData())) as Float32Array;
    const detections = decode(data, out.dims[2], lb, bitmap.width, bitmap.height, conf);
    postMessage({ type: "result", id, detections, ms: performance.now() - t0 });
  } catch (err) {
    postMessage({ type: "error", id, message: (err as Error).message });
  } finally {
    bitmap.close();
  }
};
