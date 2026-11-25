import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDetector } from "./detector/useDetector";
import type { Detection } from "./detector/types";
import { findViolations } from "./detector/violations";
import { Stage, type StageHandle, COLORS } from "./components/Stage";
import { ViolationCard } from "./components/ViolationCard";
import { ChallanSlip } from "./components/ChallanSlip";
import { LiveCamera } from "./components/LiveCamera";
import { findDuplicate, loadChallans, nextChallanNumber, saveChallans, toCsv, type Challan } from "./challans";
import { SAMPLES } from "./samples";

const REPO = "https://github.com/Qasim00760/helmet-violation-detection";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This file could not be opened as an image. Try a JPG, PNG or WebP."));
    img.src = src;
  });
}

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

export default function App() {
  const { status, detect } = useDetector();
  const stage = useRef<StageHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [name, setName] = useState("");
  const [all, setAll] = useState<Detection[] | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [conf, setConf] = useState(0.3);
  const [showRiders, setShowRiders] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fine, setFine] = useState(2000);
  const [windowMin, setWindowMin] = useState(30);
  const [challans, setChallans] = useState<Challan[]>(loadChallans);
  const [issued, setIssued] = useState<Record<number, string>>({});
  const [runId, setRunId] = useState(0);
  const [mode, setMode] = useState<"photo" | "live">("photo");

  const detections = useMemo(() => all?.filter((d) => d.score >= conf) ?? [], [all, conf]);
  const violations = useMemo(() => findViolations(detections), [detections]);
  const counts = useMemo(() => ({
    riders: detections.filter((d) => d.cls === "rider").length,
    helmet: detections.filter((d) => d.cls === "with_helmet").length,
    bare: violations.length,
  }), [detections, violations]);

  useEffect(() => saveChallans(challans), [challans]);

  const run = useCallback(async (blob: Blob, label: string) => {
    setError(""); setNotice(""); setBusy(true); setAll(null); setMs(null); setName(label); setIssued({});
    try {
      setImage(await loadImage(URL.createObjectURL(blob)));
      const r = await detect(blob, 0.15);
      setAll(r.detections); setMs(r.ms); setRunId((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [detect]);

  const runSample = useCallback(async (file: string, label: string) => {
    run(await (await fetch(`/samples/${file}`)).blob(), label);
  }, [run]);

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError(`${f.name} is not an image. Upload a JPG, PNG or WebP photo.`); return; }
    run(f, f.name);
  };

  useEffect(() => {
    if (status.state === "ready" && !image && !busy) runSample(SAMPLES[0].file, SAMPLES[0].label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.state]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => onFiles(e.clipboardData?.files ?? null);
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const issue = (i: number, plate: string, evidence: string) => {
    const dup = findDuplicate(challans, plate, windowMin);
    if (dup) { setNotice(`${plate} already has challan ${dup.number} from the last ${windowMin} minutes, so no new challan was issued.`); return; }
    const c: Challan = { number: nextChallanNumber(challans), plate, amount: fine, issuedAt: new Date().toISOString(), evidence };
    setChallans([c, ...challans]);
    setIssued({ ...issued, [i]: c.number });
    setNotice(`Challan ${c.number} issued to ${plate}.`);
  };

  const ready = status.state === "ready";

  return (
    <>
      <header className="top">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>Helmet Violation Detection</span>
        </a>
        <nav className="top-nav">
          <a href="#challans">Challans</a>
          <a href="#how">How it works</a>
          <a href={REPO}>Source code</a>
        </nav>
      </header>

      <main>
        <section className="intro">
          <h1>Find riders without helmets and issue the challan from the same screen.</h1>
          <p>
            A YOLOv8 model marks riders, helmets and number plates in a road photo or a live camera feed, reads the
            plate, and lets an officer confirm each challan. Everything runs in your browser.
          </p>
        </section>

        <div className="tabs" role="tablist" aria-label="Input">
          <button role="tab" aria-selected={mode === "photo"} className={mode === "photo" ? "is-on" : ""} onClick={() => setMode("photo")}>Photo</button>
          <button role="tab" aria-selected={mode === "live"} className={mode === "live" ? "is-on" : ""} onClick={() => setMode("live")} disabled={!ready}>Live camera</button>
          {status.state === "ready" && <span className="backend">Running on {status.backend === "webgpu" ? "the GPU (WebGPU)" : "the CPU (WebAssembly)"}</span>}
        </div>

        <section className="workspace" aria-label="Detector">
          {mode === "live" && status.state === "ready" ? (
            <div className="drop live-wrap">
              <LiveCamera
                detect={detect}
                conf={conf}
                showRiders={showRiders}
                backend={status.backend}
                onCapture={(blob, label) => { setMode("photo"); run(blob, label); }}
              />
            </div>
          ) : (
          <div
            className={`drop${image ? "" : " is-empty"}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
          >
            {image ? (
              <Stage ref={stage} image={image} detections={detections} showRiders={showRiders} busy={busy} />
            ) : (
              <div className="drop-empty">
                {status.state === "loading" && (
                  <>
                    <p>Downloading the model ({Math.round(status.progress * 87)} of 87 MB). This happens once; your browser keeps it.</p>
                    <div className="load-bar"><span style={{ width: `${status.progress * 100}%` }} /></div>
                  </>
                )}
                {status.state === "error" && <p>The model could not load: {status.message}. Refresh the page to try again.</p>}
              </div>
            )}
          </div>
          )}

          <div className="controls">
            <div className="row">
              <button className="btn primary" onClick={() => { setMode("photo"); fileInput.current?.click(); }} disabled={!ready || busy}>Upload a photo</button>
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
              <button className="btn" onClick={async () => { const b = await stage.current?.exportPng(); if (b) download("detections.png", b); }} disabled={!all || busy}>Download result</button>
              <span className="file-name" title={name}>{busy ? "Scanning, this takes a few seconds…" : name}{ms !== null && !busy ? `, ${Math.round(ms)} ms` : ""}</span>
            </div>
            <div className="row">
              <label className="slider">
                <span>Minimum confidence <output>{Math.round(conf * 100)}%</output></span>
                <input type="range" min={0.15} max={0.9} step={0.05} value={conf} onChange={(e) => setConf(Number(e.target.value))} />
              </label>
              <label className="check">
                <input type="checkbox" checked={showRiders} onChange={(e) => setShowRiders(e.target.checked)} />
                Show rider boxes
              </label>
            </div>
            <ul className="legend" aria-label="Colour key">
              <li><i style={{ background: COLORS.without_helmet }} />No helmet</li>
              <li><i style={{ background: COLORS.with_helmet }} />Helmet</li>
              <li><i style={{ background: COLORS.plate }} />Number plate</li>
              <li><i className="dashed" style={{ borderColor: COLORS.rider }} />Rider</li>
            </ul>
            {error && <p className="error" role="alert">{error}</p>}
          </div>

          <aside className="panel" aria-live="polite">
            {mode === "photo" && <div className="tally">
              <div className={counts.bare ? "tally-bad" : ""}><strong>{all ? counts.bare : "–"}</strong><span>without helmet</span></div>
              <div><strong>{all ? counts.helmet : "–"}</strong><span>with helmet</span></div>
              <div><strong>{all ? counts.riders : "–"}</strong><span>riders</span></div>
            </div>}
            {notice && <p className="notice">{notice}</p>}
            {mode === "live" && (
              <p className="panel-empty">In live mode, a frame with a rider without a helmet is captured and shown here for review.</p>
            )}
            {mode === "photo" && all && image && violations.length === 0 && (
              <p className="panel-empty">No rider without a helmet in this photo. Lower the confidence if you think one was missed.</p>
            )}
            <div className="vlist">
              {mode === "photo" && image && violations.map((v, i) => (
                <ViolationCard key={`${runId}-${i}-${v.head.x}`} index={i} image={image} violation={v} issuedNumber={issued[i]} onIssue={(p, ev) => issue(i, p, ev)} />
              ))}
            </div>
            <div className="settings">
              <label>Fine (Rs)<input type="number" min={0} step={100} value={fine} onChange={(e) => setFine(Number(e.target.value))} /></label>
              <label>Duplicate window (min)<input type="number" min={0} step={5} value={windowMin} onChange={(e) => setWindowMin(Number(e.target.value))} /></label>
            </div>
          </aside>
        </section>

        <section className="samples" aria-labelledby="samples-title">
          <h2 id="samples-title">Try a road photo</h2>
          <ul>
            {SAMPLES.map((s) => (
              <li key={s.file}>
                <button className={name === s.label ? "is-active" : ""} onClick={() => { setMode("photo"); runSample(s.file, s.label); }} disabled={!ready || busy}>
                  <img src={`/samples/${s.file}`} alt="" loading="lazy" />
                  <span>{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section id="challans" className="challans">
          <div className="challans-head">
            <h2>Issued challans</h2>
            <div className="row">
              <button className="btn" disabled={!challans.length} onClick={() => download("challans.csv", new Blob([toCsv(challans)], { type: "text/csv" }))}>Export CSV</button>
              <button className="btn subtle" disabled={!challans.length} onClick={() => { if (confirm("Delete all challans saved in this browser?")) setChallans([]); }}>Clear history</button>
            </div>
          </div>
          {challans.length ? (
            <ul className="slips">{challans.map((c) => <ChallanSlip key={c.number} challan={c} />)}</ul>
          ) : (
            <p className="muted">No challans yet. Issue one from a detected rider above; it is saved in this browser only.</p>
          )}
        </section>

        <section id="how" className="how">
          <h2>How it works</h2>
          <ol>
            <li><h3>Detect</h3><p>A YOLOv8-large model finds riders, heads with and without helmets, and number plates in a 640 px copy of the photo.</p></li>
            <li><h3>Match</h3><p>Each bare head is linked to the rider box around it, and that rider to the number plate inside or just below it.</p></li>
            <li><h3>Read</h3><p>The plate is cropped, enlarged and read with Tesseract OCR. The officer checks or corrects the text.</p></li>
            <li><h3>Issue</h3><p>The challan gets the next number for the year. The same plate is not fined twice inside the duplicate window.</p></li>
          </ol>
        </section>

        <section className="model">
          <h2>About the model</h2>
          <div className="model-grid">
            <div>
              <p>YOLOv8l fine-tuned to four classes: helmet, no helmet, rider and number plate. On its training-time validation set it reached mAP50 0.947, precision 0.941 and recall 0.918.</p>
              <p className="muted">It does best on traffic-camera style photos where the rider fills a fair part of the frame. Small, distant or blurred riders are often missed, and plate reading needs a sharp, front-facing plate. That is why every challan needs an officer to confirm it.</p>
            </div>
            <table>
              <tbody>
                <tr><th scope="row">Architecture</th><td>YOLOv8l, 43.6M parameters</td></tr>
                <tr><th scope="row">Input size</th><td>640 × 640</td></tr>
                <tr><th scope="row">Validation mAP50</th><td>0.947</td></tr>
                <tr><th scope="row">Validation mAP50-95</th><td>0.785</td></tr>
                <tr><th scope="row">Runtime</th><td>ONNX Runtime Web: WebGPU, or WebAssembly as a fallback</td></tr>
                <tr><th scope="row">Model file</th><td>87 MB, 16-bit weights</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="foot">
        <span>Built by Muhammad Qasim</span>
        <a href={REPO}>GitHub</a>
        <a href="https://qasim.devsil.com">Portfolio</a>
      </footer>
    </>
  );
}
