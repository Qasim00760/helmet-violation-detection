import { describe, expect, it } from "vitest";
import { decode, iou, letterbox, nms, rgbaToChw } from "../src/detector/geometry";
import type { Detection } from "../src/detector/types";

const box = (x: number, y: number, w: number, h: number, score: number, cls: Detection["cls"] = "with_helmet"): Detection => ({ x, y, w, h, score, cls });

describe("letterbox", () => {
  it("fits a wide image and centres it vertically", () => {
    const lb = letterbox(1280, 720);
    expect(lb.scale).toBeCloseTo(0.5);
    expect([lb.newW, lb.newH]).toEqual([640, 360]);
    expect([lb.padX, lb.padY]).toEqual([0, 140]);
  });
  it("fits a tall image and centres it horizontally", () => {
    const lb = letterbox(500, 1000);
    expect([lb.newW, lb.newH, lb.padX, lb.padY]).toEqual([320, 640, 160, 0]);
  });
});

describe("rgbaToChw", () => {
  it("splits channels into planes and scales to [0, 1]", () => {
    const px = new Uint8Array([255, 0, 51, 255, 0, 102, 255, 255]);
    const t = rgbaToChw(px.slice(0, 4), 1);
    expect(t[0]).toBe(1);
    expect(t[1]).toBe(0);
    expect(t[2]).toBeCloseTo(51 / 255);
  });
});

describe("iou and nms", () => {
  it("computes overlap", () => {
    expect(iou(box(0, 0, 10, 10, 1), box(0, 0, 10, 10, 1))).toBe(1);
    expect(iou(box(0, 0, 10, 10, 1), box(20, 20, 5, 5, 1))).toBe(0);
    expect(iou(box(0, 0, 10, 10, 1), box(5, 0, 10, 10, 1))).toBeCloseTo(50 / 150);
  });
  it("never reports one head as both helmet and no helmet", () => {
    const kept = nms([box(0, 0, 10, 20, 0.6, "with_helmet"), box(1, 0, 10, 20, 0.9, "without_helmet"), box(30, 0, 10, 20, 0.8)], 0.5);
    expect(kept).toHaveLength(2);
    expect(kept[0].cls).toBe("without_helmet");
  });
  it("keeps a rider box that overlaps a head box", () => {
    expect(nms([box(0, 0, 10, 10, 0.9, "with_helmet"), box(0, 0, 10, 10, 0.8, "rider")], 0.5)).toHaveLength(2);
  });
});

describe("decode", () => {
  it("maps model coordinates back to the original image", () => {
    const anchors = 2;
    // layout: [cx..., cy..., w..., h..., with_helmet..., without_helmet..., rider..., plate...]
    const out = new Float32Array([
      320, 10, // cx
      320, 10, // cy
      100, 4,  // w
      50, 4,   // h
      0.9, 0.05,
      0.05, 0.2,
      0.01, 0.01,
      0.01, 0.01,
    ]);
    const lb = letterbox(1280, 720); // scale 0.5, padY 140
    const dets = decode(out, anchors, lb, 1280, 720, 0.35);
    expect(dets).toHaveLength(1);
    const d = dets[0];
    expect(d.cls).toBe("with_helmet");
    expect(d.x).toBeCloseTo(540);
    expect(d.y).toBeCloseTo(310);
    expect(d.w).toBeCloseTo(200);
    expect(d.h).toBeCloseTo(100);
  });
});

