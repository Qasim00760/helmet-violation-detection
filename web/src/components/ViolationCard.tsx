import { useEffect, useRef, useState } from "react";
import type { Violation } from "../detector/violations";
import { cropToCanvas, readPlate } from "../ocr";

interface Props {
  index: number;
  image: HTMLImageElement;
  violation: Violation;
  onIssue: (plate: string, evidence: string) => void;
  issuedNumber?: string;
}

export function ViolationCard({ index, image, violation, onIssue, issuedNumber }: Props) {
  const photo = useRef<HTMLDivElement>(null);
  const plateBox = useRef<HTMLDivElement>(null);
  const [plate, setPlate] = useState("");
  const [ocr, setOcr] = useState<"reading" | "read" | "unreadable" | "none">(violation.plate ? "reading" : "none");
  const evidence = useRef("");

  useEffect(() => {
    const subject = violation.rider ?? violation.head;
    const c = cropToCanvas(image, subject, violation.rider ? 0.04 : 0.8);
    const thumb = document.createElement("canvas");
    const s = Math.min(1, 360 / Math.max(c.width, c.height));
    thumb.width = Math.round(c.width * s);
    thumb.height = Math.round(c.height * s);
    thumb.getContext("2d")!.drawImage(c, 0, 0, thumb.width, thumb.height);
    evidence.current = thumb.toDataURL("image/jpeg", 0.75);
    photo.current?.replaceChildren(thumb);
    if (!violation.plate) return;
    plateBox.current?.replaceChildren(cropToCanvas(image, violation.plate, 0.06, 180));
    let alive = true;
    readPlate(image, violation.plate)
      .then((r) => { if (!alive) return; const ok = r.text.length >= 4 && r.confidence >= 0.6; setPlate(ok ? r.text : ""); setOcr(ok ? "read" : "unreadable"); })
      .catch(() => alive && setOcr("unreadable"));
    return () => { alive = false; };
  }, [image, violation]);

  return (
    <article className="vcard">
      <header className="vcard-head">
        <h3>Rider {index + 1}</h3>
        <span className="vcard-conf">No helmet, {Math.round(violation.head.score * 100)}% sure</span>
      </header>
      <div className="vcard-body">
        <div className="vcard-photo" ref={photo} />
        <div className="vcard-plate">
          {violation.plate ? <div className="plate-crop" ref={plateBox} /> : <p className="muted small">No number plate found for this rider.</p>}
          <label>
            <span>Number plate</span>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder={ocr === "reading" ? "Reading…" : "Type the plate"}
              disabled={!!issuedNumber}
            />
          </label>
          <p className="small muted">
            {ocr === "reading" && "Reading the plate…"}
            {ocr === "read" && "Read automatically. Check it before issuing."}
            {ocr === "unreadable" && "Could not read the plate clearly. Type it from the photo."}
            {ocr === "none" && "Enter the plate if you can see it in the photo."}
          </p>
        </div>
      </div>
      {issuedNumber ? (
        <p className="vcard-done">Challan {issuedNumber} issued</p>
      ) : (
        <button className="btn danger" disabled={!plate.trim()} onClick={() => onIssue(plate.trim(), evidence.current)}>
          Issue challan
        </button>
      )}
    </article>
  );
}
