import { useEffect, useRef, useState } from "react";
import type { Detection } from "../detector/types";
import { findViolations } from "../detector/violations";
import { drawBoxes } from "./Stage";

interface Props {
  detect: (source: ImageBitmapSource, conf: number) => Promise<{ detections: Detection[]; ms: number }>;
  conf: number;
  showRiders: boolean;
  backend: "webgpu" | "wasm";
  /** Hand a still frame to the review panel. */
  onCapture: (frame: Blob, label: string) => void;
}

type CamState = "off" | "starting" | "on" | "denied" | "unavailable";

export function LiveCamera({ detect, conf, showRiders, backend, onCapture }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState<CamState>("off");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [auto, setAuto] = useState(true);
  const [stats, setStats] = useState({ ms: 0, bare: 0, riders: 0 });
  const settings = useRef({ conf, showRiders, auto });
  settings.current = { conf, showRiders, auto };

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCam("off");
  };

  const start = async (mode = facing) => {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) { setCam("unavailable"); return; }
    setCam("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      stream.current = s;
      video.current!.srcObject = s;
      await video.current!.play();
      setCam("on");
    } catch (e) {
      setCam((e as DOMException).name === "NotAllowedError" ? "denied" : "unavailable");
    }
  };

  const grab = (label: string) => {
    const v = video.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) { stop(); onCapture(b, label); } }, "image/jpeg", 0.92);
  };

  // detection loop: one frame at a time, so a slow device never queues up work
  useEffect(() => {
    if (cam !== "on") return;
    let alive = true;
    (async () => {
      while (alive && video.current && video.current.readyState >= 2) {
        const v = video.current;
        try {
          const { detections, ms } = await detect(v, 0.15);
          if (!alive) break;
          const s = settings.current;
          const shown = detections.filter((d) => d.score >= s.conf);
          const bare = findViolations(shown);
          const ctx = overlay.current?.getContext("2d");
          if (ctx) {
            ctx.canvas.width = v.videoWidth;
            ctx.canvas.height = v.videoHeight;
            ctx.clearRect(0, 0, v.videoWidth, v.videoHeight);
            drawBoxes(ctx, shown, s.showRiders, v.videoWidth, v.videoHeight);
          }
          setStats({ ms, bare: bare.length, riders: shown.filter((d) => d.cls === "rider").length });
          if (s.auto && bare.length) {
            grab(`Camera, ${new Date().toLocaleTimeString()}`);
            break;
          }
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam, detect]);

  useEffect(() => stop, []);

  const fps = stats.ms ? 1000 / stats.ms : 0;
  return (
    <div className="live">
      <div className="live-view">
        <div className={`live-frame${cam === "on" ? "" : " is-hidden"}`}>
          <video ref={video} playsInline muted />
          <canvas ref={overlay} className="live-overlay" aria-hidden="true" />
        </div>
        {cam !== "on" && (
          <div className="live-off">
            {cam === "off" && <p>Point a phone or webcam at the road. Riders without helmets are flagged as they pass.</p>}
            {cam === "starting" && <p>Waiting for camera permission…</p>}
            {cam === "denied" && <p>Camera access was blocked. Allow the camera for this site in your browser settings, then start again.</p>}
            {cam === "unavailable" && <p>No camera was found, or this browser cannot share it. Use a photo instead.</p>}
            <button className="btn primary" onClick={() => start()}>Start camera</button>
          </div>
        )}
        {cam === "on" && (
          <div className="live-hud">
            <span className="live-dot" aria-hidden="true" /> Live
            <span>{stats.bare} without helmet</span>
            <span>{fps >= 1 ? `${fps.toFixed(1)} scans/s` : `one scan every ${(stats.ms / 1000).toFixed(1)} s`}</span>
          </div>
        )}
      </div>
      {cam === "on" && (
        <div className="row live-controls">
          <button className="btn danger-outline" onClick={() => grab(`Camera, ${new Date().toLocaleTimeString()}`)}>Capture frame</button>
          <button className="btn" onClick={() => { const f = facing === "environment" ? "user" : "environment"; setFacing(f); start(f); }}>Switch camera</button>
          <button className="btn subtle" onClick={stop}>Stop</button>
          <label className="check">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Capture automatically when a rider has no helmet
          </label>
        </div>
      )}
      {backend === "wasm" && (
        <p className="small muted">
          This browser has no WebGPU, so the model runs on the CPU and live scanning is slow. Chrome or Edge on a recent laptop or phone uses the GPU and is much faster.
        </p>
      )}
    </div>
  );
}
