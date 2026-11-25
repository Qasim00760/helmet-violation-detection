import type { Detection } from "./types";

export interface Violation {
  head: Detection;
  rider: Detection | null;
  plate: Detection | null;
}

const centre = (d: Detection) => ({ cx: d.x + d.w / 2, cy: d.y + d.h / 2 });
const contains = (outer: Detection, x: number, y: number, slackX = 0, slackY = 0) =>
  x >= outer.x - slackX && x <= outer.x + outer.w + slackX && y >= outer.y - slackY && y <= outer.y + outer.h + slackY;

/**
 * Link every head without a helmet to the rider it belongs to, and that rider to a
 * number plate. A head belongs to the smallest rider box that contains its centre.
 * A plate belongs to the rider whose box (widened by 15%) contains the plate centre;
 * if none does, the nearest plate below the head is used.
 */
export function findViolations(dets: Detection[]): Violation[] {
  const riders = dets.filter((d) => d.cls === "rider");
  const plates = dets.filter((d) => d.cls === "plate");
  const used = new Set<Detection>();
  return dets
    .filter((d) => d.cls === "without_helmet")
    .sort((a, b) => a.x - b.x)
    .map((head) => {
      const { cx, cy } = centre(head);
      const rider = riders
        .filter((r) => contains(r, cx, cy, r.w * 0.05, r.h * 0.05))
        .sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
      let plate: Detection | null = null;
      const free = plates.filter((p) => !used.has(p));
      if (rider) {
        plate = free
          .filter((p) => { const c = centre(p); return contains(rider, c.cx, c.cy, rider.w * 0.15, rider.h * 0.15); })
          .sort((a, b) => b.score - a.score)[0] ?? null;
      }
      if (!plate) {
        plate = free
          .filter((p) => centre(p).cy > cy)
          .sort((a, b) => Math.hypot(centre(a).cx - cx, centre(a).cy - cy) - Math.hypot(centre(b).cx - cx, centre(b).cy - cy))[0] ?? null;
      }
      if (plate) used.add(plate);
      return { head, rider, plate };
    });
}
