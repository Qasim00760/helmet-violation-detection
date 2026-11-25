import { describe, expect, it } from "vitest";
import { findViolations } from "../src/detector/violations";
import { findDuplicate, nextChallanNumber, normalisePlate, toCsv, type Challan } from "../src/challans";
import type { Detection } from "../src/detector/types";

const d = (cls: Detection["cls"], x: number, y: number, w: number, h: number, score = 0.9): Detection => ({ cls, x, y, w, h, score });

describe("findViolations", () => {
  it("links a bare head to its rider and that rider's plate", () => {
    const dets = [
      d("rider", 0, 0, 200, 400), d("without_helmet", 70, 10, 50, 50), d("plate", 80, 330, 40, 20),
      d("rider", 400, 0, 200, 400), d("with_helmet", 470, 10, 50, 50), d("plate", 480, 330, 40, 20),
    ];
    const v = findViolations(dets);
    expect(v).toHaveLength(1);
    expect(v[0].rider?.x).toBe(0);
    expect(v[0].plate?.x).toBe(80);
  });
  it("still reports a violation when no rider box was found", () => {
    const v = findViolations([d("without_helmet", 10, 10, 30, 30)]);
    expect(v).toEqual([{ head: v[0].head, rider: null, plate: null }]);
  });
  it("gives each plate to one rider only", () => {
    const dets = [d("without_helmet", 10, 0, 20, 20), d("without_helmet", 60, 0, 20, 20), d("plate", 30, 100, 30, 10)];
    const v = findViolations(dets);
    expect(v.filter((x) => x.plate)).toHaveLength(1);
  });
});

describe("challans", () => {
  const c = (number: string, plate: string, minutesAgo: number): Challan => ({
    number, plate, amount: 1000, evidence: "", issuedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  });
  it("numbers challans per year", () => {
    const now = new Date();
    const y = now.getFullYear();
    expect(nextChallanNumber([], now)).toBe(`IBSCS-${y}-000001`);
    expect(nextChallanNumber([c(`IBSCS-${y}-000041`, "A", 1), c(`IBSCS-${y - 1}-000900`, "B", 1)], now)).toBe(`IBSCS-${y}-000042`);
  });
  it("ignores spacing and case in plates", () => {
    expect(normalisePlate(" lea-1234 ")).toBe("LEA1234");
  });
  it("flags the same plate inside the duplicate window only", () => {
    const list = [c("X", "LEA 1234", 5)];
    expect(findDuplicate(list, "lea1234", 10)).toBeDefined();
    expect(findDuplicate(list, "lea1234", 3)).toBeUndefined();
    expect(findDuplicate(list, "", 10)).toBeUndefined();
  });
  it("escapes CSV fields", () => {
    expect(toCsv([c("N1", 'A"B', 0)]).split("\n")[1]).toMatch(/^"N1","A""B","1000"/);
  });
});
