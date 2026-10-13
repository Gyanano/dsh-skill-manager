import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { addMcpServers, importSkills, parseMcpJson, scanSkills, type ImportScan, type McpParseCandidate } from "./api";
import type { PanelFace } from "./panel";

type Kind = "skill" | "mcp";

export function SkillImportDialog({ t, onClose, onImported }: { t: PanelFace["t"]; onClose: () => void; onImported: () => Promise<void> }): ReactElement {
  const [kind, setKind] = useState<Kind>("skill");
  const [source, setSource] = useState("");
  const [scan, setScan] = useState<ImportScan>();
  const [mcpCandidates, setMcpCandidates] = useState<McpParseCandidate[]>();
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

  const reset = (): void => {
    setScan(undefined);
    setMcpCandidates(undefined);
    setSelected([]);
  };

  const parse = async (): Promise<void> => {
    reset();
    if (kind === "skill") {
      const result = await scanSkills(source.trim());
      setScan(result);
      return;
    }
    setMcpCandidates(await parseMcpJson(source));
  };

  const commit = async (): Promise<void> => {
    if (kind === "skill") {
      if (scan === undefined) return;
      const result = await importSkills(scan.token, selected);
      setDone(result.imported.map((item) => item.name));
    } else {
      const result = await addMcpServers(source, selected);
      setDone(result.added);
    }
    reset();
    await onImported();
  };

  const skillRows = scan?.candidates ?? [];
  const mcpRows = mcpCandidates ?? [];
  const hasParsed = kind === "skill" ? scan !== undefined : mcpCandidates !== undefined;

  return createPortal(
    <div className="dsm-modal-backdrop">
      <div className="dsm-modal" role="dialog" aria-modal="true" aria-label={t("importTitle")}>
        <div className="dsm-modal-head">
          <span className="dsm-modal-title">{t("importTitle")}</span>
          <button type="button" className="dsm-iconButton" aria-label={t("cancel")} disabled={busy} onClick={onClose}>×</button>
        </div>
        {done !== undefined ? (
          <>
            <div className="dsm-pop-note">{kind === "skill" ? t("importDone") : t("mcpAddDone")}</div>
            <div className="dsm-importCandidates">
              {done.map((name) => <div className="dsm-muted" key={name}>{name}</div>)}
            </div>
            {kind === "mcp" && <div className="dsm-pop-note">{t("mcpAddHint")}</div>}
            <div className="dsm-formActions">
              <Button variant="primary" size="sm" onClick={onClose}>{t("importClose")}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="dsm-kindSwitch" role="tablist">
              {(["skill", "mcp"] as const).map((key) => (
                <button key={key} type="button" role="tab" className="dsm-tab" data-active={kind === key}
                  disabled={busy}
                  onClick={() => {
                    setKind(key);
                    reset();
                  }}
                >
                  {key === "skill" ? t("kindSkill") : t("kindMcp")}
                </button>
              ))}
            </div>
            <label className="dsm-fieldLabel" htmlFor="dsm-import-source">{kind === "skill" ? t("importSource") : t("mcpSource")}</label>
            {kind === "skill" ? (
              <input
                id="dsm-import-source"
                className="dsm-input"
                value={source}
                disabled={busy}
                placeholder={t("importPlaceholder")}
                onChange={(event) => {
                  setSource(event.target.value);
                  reset();
                }}
              />
            ) : (
              <textarea
                className="dsm-input dsm-textarea"
                value={source}
                disabled={busy}
                placeholder={t("mcpJsonPlaceholder")}
                rows={8}
                onChange={(event) => {
                  setSource(event.target.value);
                  reset();
                }}
              />
            )}
            <div className="dsm-pop-note">{kind === "skill" ? t("importWarning") : t("mcpWarning")}</div>
            {kind === "skill" && scan !== undefined && <div className="dsm-muted">{scan.destination}</div>}
            {hasParsed && (kind === "skill" ? skillRows.length === 0 : mcpRows.length === 0) && (
              <div className="dsm-muted">{kind === "skill" ? t("importEmpty") : t("mcpEmptyParse")}</div>
            )}
            {kind === "skill" && skillRows.length > 0 && (
              <div className="dsm-importCandidates">
                {skillRows.map((candidate) => (
                  <label className="dsm-row" key={candidate.id}>
                    <input
                      type="checkbox"
                      disabled={busy || candidate.conflict}
                      checked={selected.includes(candidate.id)}
                      onChange={(event) => setSelected((current) => event.target.checked ? [...current, candidate.id] : current.filter((value) => value !== candidate.id))}
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
            {kind === "mcp" && mcpRows.length > 0 && (
              <div className="dsm-importCandidates">
                {mcpRows.map((candidate) => (
                  <label className="dsm-row" key={candidate.serverName}>
                    <input
                      type="checkbox"
                      disabled={busy || candidate.conflict}
                      checked={selected.includes(candidate.serverName)}
                      onChange={(event) => setSelected((current) => event.target.checked ? [...current, candidate.serverName] : current.filter((value) => value !== candidate.serverName))}
                    />
                    <div className="dsm-row-main">
                      <div className="dsm-row-title">
                        <span className="dsm-row-name">{candidate.serverName}</span>
                        {candidate.conflict && <span className="dsm-badge" data-tone="warn">{t("importConflict")}</span>}
                      </div>
                      <div className="dsm-row-desc">{candidate.transport}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {error !== undefined && <div className="dsm-error" role="alert">{error}</div>}
            <div className="dsm-formActions">
              {!hasParsed ? (
                <Button variant="primary" size="sm" disabled={busy || source.trim() === ""} onClick={() => void run(parse)}>{busy ? t("importParsing") : t("scanSkills")}</Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={reset}>{t("importBack")}</Button>
                  <Button variant="primary" size="sm" disabled={busy || selected.length === 0} onClick={() => void run(commit)}>{busy ? t("importing") : t("importSelected")}</Button>
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
