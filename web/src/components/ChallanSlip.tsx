import type { Challan } from "../challans";

const fmt = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" });

export function ChallanSlip({ challan }: { challan: Challan }) {
  return (
    <li className="slip">
      <div className="slip-top">
        <span className="slip-title">Traffic challan</span>
        <span className="slip-no">{challan.number}</span>
      </div>
      <div className="slip-body">
        {challan.evidence && <img src={challan.evidence} alt={`Evidence photo for ${challan.plate}`} />}
        <dl>
          <div><dt>Number plate</dt><dd className="slip-plate">{challan.plate}</dd></div>
          <div><dt>Offence</dt><dd>Riding without a helmet</dd></div>
          <div><dt>Fine</dt><dd>Rs {challan.amount.toLocaleString("en-PK")}</dd></div>
          <div><dt>Issued</dt><dd>{fmt.format(new Date(challan.issuedAt))}</dd></div>
        </dl>
      </div>
      <span className="slip-stamp" aria-hidden="true">Issued</span>
    </li>
  );
}
