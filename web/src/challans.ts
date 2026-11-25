export interface Challan {
  number: string;        // IBSCS-YYYY-000001
  plate: string;
  amount: number;
  issuedAt: string;      // ISO time
  evidence: string;      // small JPEG data URL of the rider
}

const KEY = "ibscs.challans.v1";

export function normalisePlate(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function nextChallanNumber(existing: Challan[], now = new Date()): string {
  const year = now.getFullYear();
  const prefix = `IBSCS-${year}-`;
  const last = existing
    .filter((c) => c.number.startsWith(prefix))
    .map((c) => Number(c.number.slice(prefix.length)))
    .reduce((a, b) => Math.max(a, b), 0);
  return prefix + String(last + 1).padStart(6, "0");
}

/** A plate already fined inside the window is a duplicate (the same rider seen twice). */
export function findDuplicate(existing: Challan[], plate: string, windowMinutes: number, now = new Date()): Challan | undefined {
  const p = normalisePlate(plate);
  if (!p) return undefined;
  return existing.find(
    (c) => normalisePlate(c.plate) === p && now.getTime() - new Date(c.issuedAt).getTime() < windowMinutes * 60_000,
  );
}

export function toCsv(challans: Challan[]): string {
  const rows = [["Challan number", "Number plate", "Amount (PKR)", "Issued at"]];
  for (const c of challans) rows.push([c.number, c.plate, String(c.amount), c.issuedAt]);
  return rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function loadChallans(): Challan[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function saveChallans(list: Challan[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
}
