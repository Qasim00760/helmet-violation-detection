import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CLASS_LABELS, type ClassName, type Detection } from "../detector/types";

export const COLORS: Record<ClassName, string> = {
  with_helmet: "#1f9d55",
  without_helmet: "#d7263d",
  rider: "#5b8def",
  plate: "#f5b301",
};

interface Props { image: HTMLImageElement | null; detections: Detection[]; showRiders: boolean; busy: boolean }
export interface StageHandle { exportPng(): Promise<Blob | null> }

function draw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, dets: Detection[], showRiders: boolean) {
  const { naturalWidth: w, naturalHeight: h } = img;
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.drawImage(img, 0, 0);
  const line = Math.max(2, Math.round(Math.max(w, h) / 320));
  const font = Math.max(12, Math.round(Math.max(w, h) / 55));
  ctx.font = `600 ${font}px Archivo, sans-serif`;
  const order: ClassName[] = ["rider", "plate", "with_helmet", "without_helmet"];
  for (const cls of order) {
    if (cls === "rider" && !showRiders) continue;
    for (const d of dets.filter((x) => x.cls === cls)) {
      ctx.strokeStyle = COLORS[cls];
      ctx.lineWidth = cls === "rider" ? Math.max(1, line - 1) : line;
      ctx.setLineDash(cls === "rider" ? [line * 3, line * 2] : []);
      ctx.strokeRect(d.x, d.y, d.w, d.h);
      ctx.setLineDash([]);
      if (cls === "rider") continue;
      const label = `${CLASS_LABELS[cls]} ${Math.round(d.score * 100)}%`;
      const tw = ctx.measureText(label).width + font * 0.6;
      const ty = d.y - font * 1.3 < 0 ? d.y + d.h : d.y - font * 1.3;
      ctx.fillStyle = COLORS[cls];
      ctx.fillRect(d.x, ty, tw, font * 1.3);
      ctx.fillStyle = cls === "plate" ? "#14202b" : "#fff";
      ctx.fillText(label, d.x + font * 0.3, ty + font * 0.98);
    }
  }
}

export const Stage = forwardRef<StageHandle, Props>(function Stage({ image, detections, showRiders, busy }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx && image) draw(ctx, image, detections, showRiders);
  }, [image, detections, showRiders]);
  useImperativeHandle(ref, () => ({
    exportPng: () => new Promise((resolve) => (canvas.current ? canvas.current.toBlob(resolve, "image/png") : resolve(null))),
  }));
  return (
    <div className="stage" aria-busy={busy}>
      <canvas ref={canvas} className="stage-canvas" role="img" aria-label="Photo with detected riders, helmets and number plates" />
      {busy && <div className="stage-scan" aria-hidden="true" />}
    </div>
  );
});
