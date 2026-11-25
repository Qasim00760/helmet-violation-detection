import { useCallback, useEffect, useRef, useState } from "react";
import type { Detection } from "./types";

type Status = { state: "loading"; progress: number } | { state: "ready" } | { state: "error"; message: string };

export function useDetector() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, { resolve: (r: { detections: Detection[]; ms: number }) => void; reject: (e: Error) => void }>());
  const nextId = useRef(0);
  const [status, setStatus] = useState<Status>({ state: "loading", progress: 0 });

  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") setStatus({ state: "loading", progress: m.value });
      else if (m.type === "ready") setStatus({ state: "ready" });
      else if (m.type === "result") {
        pending.current.get(m.id)?.resolve({ detections: m.detections, ms: m.ms });
        pending.current.delete(m.id);
      } else if (m.type === "error") {
        if (m.id !== undefined) {
          pending.current.get(m.id)?.reject(new Error(m.message));
          pending.current.delete(m.id);
        } else setStatus({ state: "error", message: m.message });
      }
    };
    return () => w.terminate();
  }, []);

  const detect = useCallback(async (image: Blob, conf: number) => {
    const bitmap = await createImageBitmap(image);
    const id = nextId.current++;
    return new Promise<{ detections: Detection[]; ms: number }>((resolve, reject) => {
      pending.current.set(id, { resolve, reject });
      worker.current!.postMessage({ id, bitmap, conf }, [bitmap]);
    });
  }, []);

  return { status, detect };
}
