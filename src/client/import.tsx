import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { useState, type ReactElement } from "react";
import { scanSkills, importSkills, type ImportScan } from "./api";
import type { PanelFace } from "./panel";

export function SkillImportForm({ t, onClose, onImported }: { t: PanelFace["t"]; onClose: () => void; onImported: () => Promise<void> }): ReactElement {
  const [source, setSource] = useState("");
  const [scan, setScan] = useState<ImportScan>();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try { await task(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <div className="dsm-form">
    <div className="dsm-section">{t("importTitle")}</div>
    <label className="dsm-fieldLabel" htmlFor="dsm-import-source">{t("importSource")}</label>
    <input id="dsm-import-source" className="dsm-input" value={source} disabled={busy} placeholder={t("importPlaceholder")} onChange={(event) => {
      setSource(event.target.value);
      setScan(undefined);
      setSelected([]);
    }} />
    <div className="dsm-muted">{t("importWarning")}</div>
    <Button variant="ghost" size="sm" disabled={busy || source.trim() === ""} onClick={() => void run(async () => {
      setScan(undefined);
      setSelected([]);
      const result = await scanSkills(source.trim());
      setScan(result);
    })}>{busy ? t("loading") : t("scanSkills")}</Button>
    {scan && <>
      <div className="dsm-muted">{scan.destination}</div>
      {scan.candidates.length === 0 && <div className="dsm-muted">{t("importEmpty")}</div>}
      <div className="dsm-importCandidates">{scan.candidates.map((candidate) => <label className="dsm-row" key={candidate.id}>
        <input type="checkbox" disabled={busy || candidate.conflict} checked={selected.includes(candidate.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))} />
        <div className="dsm-row-main"><div className="dsm-row-title"><span className="dsm-row-name">{candidate.name}</span>{candidate.conflict && <span className="dsm-badge">{t("importConflict")}</span>}</div>
          <div className="dsm-row-desc">{candidate.description}</div><div className="dsm-muted">{candidate.relativePath}</div>{candidate.error && <div className="dsm-error">{candidate.error}</div>}
        </div>
      </label>)}</div>
    </>}
    {error && <div className="dsm-error" role="alert">{error}</div>}
    <div className="dsm-formActions">
      <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>{t("cancel")}</Button>
      <Button variant="primary" size="sm" disabled={busy || !scan || selected.length === 0} onClick={() => void run(async () => {
        if (!scan) return;
        await importSkills(scan.token, selected);
        await onImported();
        onClose();
      })}>{t("importSelected")}</Button>
    </div>
  </div>;
}
