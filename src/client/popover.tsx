import { IconSettingsOutlineRegular, Switch, Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import { Component, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  fetchWorkspaceView,
  mcpServersOf,
  resolveServerName,
  toggleWorkspaceMcp,
  toggleWorkspaceSkill,
  type PluginManagerRemote,
  type PluginRow,
  type SkillView,
  type WorkspaceView,
} from "./api";
import type { Dict } from "./locales";
import { rowLabels } from "./panel";
import { skillBadges } from "./rows";

export interface WorkspaceFace {
  t: (key: keyof Dict, params?: Record<string, string | number>) => string;
  cwd?: string;
  pluginManager: PluginManagerRemote;
}

interface PanelAnchor {
  left: number;
  bottom: number;
}

export function WorkspaceControl(face: WorkspaceFace): ReactElement {
  const { t, cwd } = face;
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<PanelAnchor | undefined>(undefined);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const openPanel = (): void => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect === undefined) {
      setAnchor(undefined);
      setOpen(true);
      return;
    }
    const width = Math.min(420, Math.round(window.innerWidth * 0.72));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setAnchor({ left, bottom: Math.max(10, window.innerHeight - rect.top + 10) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onReflow = (): void => {
      if (buttonRef.current === null || !buttonRef.current.isConnected) {
        setOpen(false);
        return;
      }
      openPanel();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  return (
    <span className="dsm-trigger">
      <Tooltip label={t("workspaceTitle")} side="top" delayMs={500}>
        <button
          ref={buttonRef}
          type="button"
          aria-label={t("workspaceTitle")}
          aria-expanded={open}
          onClick={() => {
            if (open) setOpen(false);
            else openPanel();
          }}
        >
          <IconSettingsOutlineRegular size={14} />
        </button>
      </Tooltip>
      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: anchor?.left ?? 8,
            bottom: anchor?.bottom ?? 10,
            width: "min(420px, 72vw)",
            maxHeight: "min(400px, 55vh)",
            overflowY: "auto",
            overscrollBehavior: "contain",
            zIndex: 80,
          }}
        >
          <PopoverBoundary>
            <WorkspacePopover t={t} cwd={cwd} pluginManager={face.pluginManager} />
          </PopoverBoundary>
        </div>,
        document.body,
      )}
    </span>
  );
}

export function WorkspacePopover(face: WorkspaceFace): ReactElement {
  const { t, cwd } = face;
  const [data, setData] = useState<WorkspaceView | undefined>(undefined);
  const [servers, setServers] = useState<PluginRow[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    if (cwd === undefined || cwd === "") return;
    const failures: string[] = [];
    try {
      setData(await fetchWorkspaceView(cwd));
    } catch (cause) {
      failures.push(textOf(cause));
    }
    try {
      setServers(mcpServersOf(await face.pluginManager.listPlugins()));
    } catch (cause) {
      failures.push(textOf(cause));
    }
    setError(failures.length > 0 ? failures.join("；") : undefined);
  }, [cwd, face.pluginManager]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const labels = rowLabels(t);

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key);
    setError(undefined);
    try {
      await action();
      await reload();
    } catch (cause) {
      setError(textOf(cause));
    } finally {
      setBusy(undefined);
    }
  };

  const projectRows = filterSkills(projectRowsOf(data), query);
  const globalRows = filterSkills(globalRowsOf(data), query);
  const serverRows = (servers ?? []).filter((row) => {
    if (query === "") return true;
    const needle = query.toLowerCase();
    return `${row.entryId ?? ""}`.toLowerCase().includes(needle);
  });
  const denials = data === undefined ? {} : mcpDenialsOf(data);

  return (
    <div className="dsm-pop">
      <div className="dsm-pop-header">{t("workspaceTitle")}</div>
      {cwd !== undefined && <div className="dsm-pop-path">{cwd}</div>}
      <div className="dsm-pop-note">{t("workspaceEffect")}</div>
      <input
        className="dsm-search"
        value={query}
        placeholder={t("searchPlaceholder")}
        onChange={(event) => setQuery(event.target.value)}
      />
      {cwd === undefined || cwd === "" ? (
        <div className="dsm-muted">{t("workspaceNone")}</div>
      ) : (
        <>
          {error !== undefined && <div className="dsm-error">{error}</div>}
          <div className="dsm-section">{t("workspaceProject")}</div>
          {projectRows.length === 0 && <div className="dsm-muted">{t("workspaceProjectEmpty")}</div>}
          {projectRows.map((skill) => {
            const invocation = skill.invocation ?? { modelInvocable: true, userInvocable: true };
            const checked = invocation.modelInvocable || invocation.userInvocable;
            const key = `project:${skill.name}`;
            const description = skill.description ?? "";
            return (
              <div className="dsm-row" data-disabled={!checked} key={key}>
                <div className="dsm-row-main">
                  <div className="dsm-row-title">
                    <span className="dsm-row-name">{skill.name}</span>
                    {!invocation.modelInvocable && invocation.userInvocable && (
                      <span className="dsm-badge">/</span>
                    )}
                    {skill.parseError !== undefined && (
                      <span className="dsm-badge" data-tone="warn">{t("skillInvalid")}</span>
                    )}
                  </div>
                  {description !== "" && <div className="dsm-row-desc" title={description}>{description}</div>}
                </div>
                <Switch
                  checked={checked}
                  disabled={busy === key || skill.readOnly}
                  label={skill.name}
                  onChange={(next) => {
                    void run(key, async () => {
                      await toggleWorkspaceSkill(cwd, skill.name, next);
                    });
                  }}
                />
              </div>
            );
          })}
          <div className="dsm-section">{t("workspaceGlobal")}</div>
          {globalRows.map((skill) => {
            const workspaceAllowed = skill.workspaceDisabled !== true;
            const key = `global:${skill.name}`;
            const locked = busy === key || skill.disabled || skill.readOnly || skill.path === undefined;
            const description = skill.description ?? "";
            return (
              <div className="dsm-row" data-disabled={!workspaceAllowed || skill.disabled} key={key}>
                <div className="dsm-row-main">
                  <div className="dsm-row-title">
                    <span className="dsm-row-name">{skill.name}</span>
                    {skillBadges(skill, labels).map((badge) => (
                      <span key={badge.text} className="dsm-badge" data-tone={badge.tone}>{badge.text}</span>
                    ))}
                  </div>
                  {description !== "" && <div className="dsm-row-desc" title={description}>{description}</div>}
                </div>
                <Switch
                  checked={workspaceAllowed}
                  disabled={locked}
                  label={skill.name}
                  onChange={(next) => {
                    void run(key, async () => {
                      await toggleWorkspaceSkill(cwd, skill.name, next);
                    });
                  }}
                />
              </div>
            );
          })}
          <div className="dsm-section">{t("workspaceMcp")}</div>
          <div className="dsm-pop-note">{t("workspaceMcpHint")}</div>
          {serverRows.length === 0 && servers !== undefined && servers.length > 0 && <div className="dsm-muted">{t("empty")}</div>}
          {servers !== undefined && servers.length === 0 && <div className="dsm-muted">{t("mcpEmpty")}</div>}
          {serverRows.map((row) => {
            const entryId = row.entryId ?? "";
            const serverName = resolveServerName(entryId, data?.mcpServers);
            const denied = denials[serverName] !== undefined;
            const key = `mcp:${entryId}`;
            return (
              <div className="dsm-row" data-disabled={denied || row.enabled !== true} key={key}>
                <div className="dsm-row-main">
                  <div className="dsm-row-title">
                    <span className="dsm-row-name">{serverName}</span>
                    <button
                      type="button"
                      className="dsm-mini"
                      disabled={busy === key}
                      title={t("workspaceGlobalState", { state: row.enabled === true ? t("enabled") : t("disabled") })}
                      onClick={() => {
                        void run(key, async () => {
                          await face.pluginManager.setPluginEnabled(entryId, row.enabled !== true);
                        });
                      }}
                    >
                      {t("workspaceGlobalState", { state: row.enabled === true ? t("enabled") : t("disabled") })}
                    </button>
                  </div>
                  <div className="dsm-row-desc">{entryId}</div>
                </div>
                <Switch
                  checked={!denied}
                  disabled={busy === key}
                  label={entryId}
                  onChange={(next) => {
                    void run(key, async () => {
                      await toggleWorkspaceMcp(cwd, serverName, entryId, serverName, !next);
                    });
                  }}
                />
              </div>
            );
          })}
          <div className="dsm-pop-footer">{t("workspaceExternal")}</div>
        </>
      )}
    </div>
  );
}

class PopoverBoundary extends Component<{ children: ReactNode }, { message: string | undefined }> {
  state: { message: string | undefined } = { message: undefined };
  static getDerivedStateFromError(error: unknown): { message: string } {
    return { message: textOf(error) };
  }
  componentDidCatch(error: unknown): void {
    console.error("dsh-skill-manager: workspace popover crashed", error);
  }
  render(): ReactNode {
    if (this.state.message !== undefined) {
      return <div className="dsm-error">dsh-skill-manager: {this.state.message}</div>;
    }
    return this.props.children;
  }
}

function filterSkills(rows: SkillView[], query: string): SkillView[] {
  if (query === "") return rows;
  const needle = query.toLowerCase();
  return rows.filter((skill) =>
    skill.name.toLowerCase().includes(needle) || (skill.description ?? "").toLowerCase().includes(needle));
}

function mcpDenialsOf(data: WorkspaceView): Record<string, { entryId: string; title?: string }> {
  const raw = data.mcpDenials;
  return raw !== null && typeof raw === "object" ? raw : {};
}

function projectRowsOf(data: WorkspaceView | undefined): SkillView[] {
  const rows = data?.project;
  return Array.isArray(rows) ? rows : [];
}

function globalRowsOf(data: WorkspaceView | undefined): SkillView[] {
  const rows = data?.global;
  return Array.isArray(rows) ? rows : [];
}

function textOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
