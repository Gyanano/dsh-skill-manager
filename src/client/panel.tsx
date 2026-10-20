import {
  Button,
  IconInfoOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  StateDot,
  Switch,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  fetchGlobalView,
  mcpServersOf,
  resolveServerName,
  toggleGlobalSkill,
  type McpServerInfo,
  type PluginManagerRemote,
  type PluginRow,
  type SkillView,
} from "./api";
import { changeNotice, skillBadges, type RowLabels } from "./rows";
import type { Dict } from "./locales";
import { SkillImportDialog } from "./import";

export interface PanelFace {
  t: (key: keyof Dict, params?: Record<string, string | number>) => string;
  pluginManager: PluginManagerRemote;
  onRemoteEvent: (event: string, listener: () => void) => () => void;
}

export function SkillsPanelPage(face: PanelFace): ReactElement {
  const { t } = face;
  const [tab, setTab] = useState<"skills" | "mcp" | "external">("skills");
  const [skills, setSkills] = useState<SkillView[] | undefined>(undefined);
  const [scanned, setScanned] = useState<McpServerInfo[] | undefined>(undefined);
  const [servers, setServers] = useState<PluginRow[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const reload = useCallback(async () => {
    const failures: string[] = [];
    setRefreshing(true);
    try {
      const view = await fetchGlobalView();
      setSkills(view.skills);
      setScanned(view.mcpServers);
    } catch (error) {
      failures.push(`${t("loadFailed")}(skills): ${textOf(error)}`);
    }
    try {
      setServers(mcpServersOf(await face.pluginManager.listPlugins()));
    } catch (error) {
      failures.push(`${t("loadFailed")}(mcp): ${textOf(error)}`);
    }
    setError(failures.length > 0 ? failures.join("；") : undefined);
    setRefreshing(false);
  }, [face.pluginManager, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => face.onRemoteEvent("plugin-manager/changed", () => {
    void face.pluginManager.listPlugins().then((rows) => setServers(mcpServersOf(rows))).catch(() => undefined);
  }), [face]);

  const labels = rowLabels(t);

  const flipSkill = async (skill: SkillView, enable: boolean): Promise<void> => {
    if (skill.path === undefined) return;
    setBusy(skill.path);
    setError(undefined);
    try {
      await toggleGlobalSkill(skill.path, enable);
      await reload();
    } catch (error) {
      setError(`${t("skillEnableFailed")}: ${textOf(error)}`);
    } finally {
      setBusy(undefined);
    }
  };

  const flipServer = async (row: PluginRow, enable: boolean): Promise<void> => {
    const entryId = row.entryId;
    if (typeof entryId !== "string") return;
    setBusy(entryId);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await face.pluginManager.setPluginEnabled(entryId, enable);
      setNotice(changeNotice(result, {
        applied: t("mcpApplied"),
        restartRequired: t("mcpRestartRequired"),
        overridden: t("mcpOverridden"),
        failed: t("mcpFailed"),
      }));
      await reload();
    } catch (error) {
      setError(`${t("mcpToggleFailed")}: ${textOf(error)}`);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="dsm-root">
      <div className="dsm-pageHead" data-window-drag="true">
        <div>
          <h1 className="dsm-pageTitle">{t("panelTitle")}</h1>
          <div className="dsm-pageIntro">
            <span>{t("panelIntro")}</span>
            <Tooltip label={t("infoDescription")} side="bottom" delayMs={300} portal openOnClick>
              <Button variant="ghost" size="sm" className="dsm-infoButton" aria-label={t("infoLabel")}>
                <IconInfoOutlineRegular size={11} aria-hidden="true" />
              </Button>
            </Tooltip>
          </div>
        </div>
        <div className="dsm-toolbar">
          <Tooltip label={t("refresh")} side="bottom" delayMs={500} portal disabled={refreshing}>
            <button
              type="button"
              className="dsm-iconButton"
              aria-label={t("refresh")}
              aria-busy={refreshing}
              disabled={refreshing}
              onClick={() => {
                void reload();
              }}
            >
              <span className="dsm-iconWrap" aria-hidden="true">
                {refreshing ? <StateDot state="ongoing" size={18} /> : <IconRefreshOutlineRegular />}
              </span>
            </button>
          </Tooltip>
          <Button
            variant="primary"
            size="sm"
            className="dsm-addButton"
            icon={<IconPlusOutlineRegular size={13} />}
            onClick={() => {
              setShowForm(true);
            }}
          >
            {t("addSkill")}
          </Button>
        </div>
      </div>
      <div className="dsm-tabs" role="tablist">
        {(["skills", "mcp", "external"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="dsm-tab"
            data-active={tab === key}
            onClick={() => {
              setTab(key);
            }}
          >
            {key === "skills" ? t("tabSkills") : key === "mcp" ? t("tabMcp") : t("tabExternal")}
          </button>
        ))}
      </div>
      {error !== undefined && <div className="dsm-error">{error}</div>}
      {notice !== undefined && <div className="dsm-muted">{notice}</div>}
      {showForm && <SkillImportDialog t={t} onClose={() => setShowForm(false)} onImported={reload} />}
      {tab === "skills" && (
        <>
          <div className="dsm-list">
          {skills === undefined && <div className="dsm-muted">{t("loading")}</div>}
          {skills !== undefined && skills.length === 0 && <div className="dsm-muted">{t("empty")}</div>}
          {skills?.map((skill) => {
            const checked = !skill.disabled;
            const locked = skill.readOnly || busy === skill.path;
            return (
              <div className="dsm-row" data-disabled={!checked} key={`${skill.source}:${skill.path ?? skill.name}`}>
                <div className="dsm-row-main">
                  <div className="dsm-row-title">
                    <span className="dsm-row-name">{skill.name}</span>
                    {skillBadges(skill, labels).map((badge) => (
                      <span key={badge.text} className="dsm-badge" data-tone={badge.tone}>{badge.text}</span>
                    ))}
                  </div>
                  {skill.description !== "" && <div className="dsm-row-desc" title={skill.description}>{skill.description}</div>}
                </div>
                <Switch
                  checked={checked}
                  disabled={locked}
                  label={skill.name}
                  onChange={(next) => {
                    void flipSkill(skill, next);
                  }}
                />
              </div>
            );
          })}
          </div>
        </>
      )}
      {tab === "mcp" && (
        <div className="dsm-list">
          {servers === undefined && <div className="dsm-muted">{t("loading")}</div>}
          {servers !== undefined && servers.length === 0 && <div className="dsm-muted">{t("mcpEmpty")}</div>}
          {servers?.map((row) => {
            const entryId = row.entryId ?? "";
            const serverName = resolveServerName(entryId, scanned);
            const checked = row.enabled === true;
            const locked = busy === entryId;
            return (
              <div className="dsm-row" data-disabled={!checked} key={entryId}>
                <div className="dsm-row-main">
                  <div className="dsm-row-title">
                    <span className={`dsm-dot${checked ? (row.fiberPhase === "active" ? " dsm-dot-ok" : " dsm-dot-bad") : " dsm-dot-off"}`} aria-hidden="true" />
                    <span className="dsm-row-name">{serverName}</span>
                    {checked && row.fiberPhase !== null && row.fiberPhase !== undefined && row.fiberPhase !== "active" && (
                      <span className="dsm-badge" data-tone="warn">{row.fiberPhase}</span>
                    )}
                  </div>
                  <div className="dsm-row-desc">{entryId}</div>
                </div>
                <Switch
                  checked={checked}
                  disabled={locked}
                  label={entryId}
                  onChange={(next) => {
                    void flipServer(row, next);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      {tab === "external" && <div className="dsm-muted">{t("externalEmpty")}</div>}
    </div>
  );
}

export function rowLabels(t: PanelFace["t"]): RowLabels {
  return {
    globalDisabled: t("skillGlobalDisabled"),
    invalid: t("skillInvalid"),
    readOnly: t("skillReadOnly"),
    bundled: t("skillBundled"),
    runtime: t("skillRuntime"),
    project: t("skillSourceProject"),
    custom: t("skillSourceCustom"),
    user: t("skillSourceUser"),
    globalEnabled: (state) => t("workspaceGlobalState", { state }),
    enabled: t("enabled"),
    disabled: t("disabled"),
  };
}

function textOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
