import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { importSkills, scanSkills, type ImportScan } from "./api";
import type { PanelFace } from "./panel";

export function SkillImportDialog({ t, onClose, onImported }: { t: PanelFace["t"]; onClose: () => void; onImported: () => Promise<void> }): ReactElement {
  const [source, setSource] = useState("");
  const [scan, setScan] = useState<ImportScan>();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string[]>();

  const run = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const scanNow = async (): Promise<void> => {
    setScan(undefined);
    setSelected([]);
    setDone(undefined);
    const result = await scanSkills(source.trim());
    setScan(result);
  };

  const importNow = async (): Promise<void> => {
    if (scan === undefined) return;
    const result = await importSkills(scan.token, selected);
    setDone(result.imported.map((item) => item.name));
    setScan(undefined);
    setSelected([]);
    await onImported();
  };

  return createPortal(
    <div className="dsm-modal-backdrop">
      <div className="dsm-modal" role="dialog" aria-modal="true" aria-label={t("importTitle")}>
        <div className="dsm-modal-head">
          <span className="dsm-modal-title">{t("importTitle")}</span>
          <button type="button" className="dsm-iconButton" aria-label={t("cancel")} disabled={busy} onClick={onClose}>×</button>
        </div>
        {done !== undefined ? (
          <>
            <div className="dsm-pop-note">{t("importDone")}</div>
            <div className="dsm-importCandidates">
              {done.map((name) => <div className="dsm-muted" key={name}>{name}</div>)}
            </div>
            <div className="dsm-formActions">
              <Button variant="primary" size="sm" onClick={onClose}>{t("importClose")}</Button>
            </div>
          </>
        ) : (
          <>
            <label className="dsm-fieldLabel" htmlFor="dsm-import-source">{t("importSource")}</label>
            <input
              id="dsm-import-source"
              className="dsm-input"
              value={source}
              disabled={busy}
              placeholder={t("importPlaceholder")}
              onChange={(event) => {
                setSource(event.target.value);
                setScan(undefined);
                setSelected([]);
              }}
            />
            <div className="dsm-pop-note">{t("importWarning")}</div>
            {scan !== undefined && <div className="dsm-muted">{scan.destination}</div>}
            {scan !== undefined && scan.candidates.length === 0 && <div className="dsm-muted">{t("importEmpty")}</div>}
            {scan !== undefined && scan.candidates.length > 0 && (
              <div className="dsm-importCandidates">
                {scan.candidates.map((candidate) => (
                  <label className="dsm-row" key={candidate.id}>
                    <input
                      type="checkbox"
                      disabled={busy || candidate.conflict}
                      checked={selected.includes(candidate.id)}
                      onChange={(event) => setSelected((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))}
                    />
                    <div className="dsm-row-main">
                      <div className="dsm-row-title">
                        <span className="dsm-row-name">{candidate.name}</span>
                        {candidate.conflict && <span className="dsm-badge" data-tone="warn">{t("importConflict")}</span>}
                      </div>
                      <div className="dsm-row-desc">{candidate.description}</div>
                      <div className="dsm-muted">{candidate.relativePath}</div>
                      {candidate.error !== undefined && <div className="dsm-error">{candidate.error}</div>}
                    </div>
                  </label>
                ))}
              </div>
            )}
            {error !== undefined && <div className="dsm-error" role="alert">{error}</div>}
            <div className="dsm-formActions">
              {scan === undefined ? (
                <Button variant="primary" size="sm" disabled={busy || source.trim() === ""} onClick={() => void run(scanNow)}>{busy ? t("importParsing") : t("scanSkills")}</Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setScan(undefined); setSelected([]); }}>{t("importBack")}</Button>
                  <Button variant="primary" size="sm" disabled={busy || selected.length === 0} onClick={() => void run(importNow)}>{busy ? t("importing") : t("importSelected")}</Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
