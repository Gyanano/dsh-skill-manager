import { IconSkillOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import { type ReactElement } from "react";
import { type ChangeResult, type PluginManagerRemote, type PluginRow } from "./api";
import { en, NS, zh, type Dict } from "./locales";
import { SkillsPanelPage, type PanelFace } from "./panel";
import { WorkspaceControl, type WorkspaceFace } from "./popover";
import { injectSharedStyles } from "./styles";

export const PANEL_ID = "skills";

interface RemoteFailureLike {
  code?: string;
  message?: string;
}

interface RemoteResultLike<T> {
  ok: boolean;
  value?: T;
  error?: RemoteFailureLike;
}

interface RawPluginManagerRemote {
  listPlugins(): Promise<RemoteResultLike<PluginRow[]>>;
  setPluginEnabled(entryId: string, enabled: boolean): Promise<RemoteResultLike<ChangeResult>>;
}

interface ClientContext {
  effect(callback: () => unknown, label: string): () => void;
  inject(services: string[], callback: (scoped: ClientContext) => void): void;
  slots: {
    inject(parent: string, factory: () => unknown): void;
    register(options: Record<string, unknown>, component: unknown): () => void;
  };
  locale: {
    register(namespace: string, dictionaries: { zh: Dict; en: Dict }): () => void;
    bind(namespace: string): (key: keyof Dict, params?: Record<string, string | number>) => string;
  };
  workspaces?: { list: { getSnapshot(): { items: Array<{ workspaceId: string; path: string; title: string }> } } };
  sessions?: {
    list: {
      getSnapshot(): {
        byId: Record<string, { cwd?: string } | undefined>;
      };
    };
  };
  remote: {
    $on(event: string, listener: () => void): () => void;
    pluginManager?: RawPluginManagerRemote;
  };
}

export const name = "dsh-skill-manager-client";

export const inject = ["slots", "locale", "sessions", "workspaces", "remote", "remote.pluginManager"];

function remoteErrorText(error: RemoteFailureLike | undefined): string {
  if (error === undefined) return "remote 调用失败";
  return error.message !== undefined && error.message !== "" ? `${error.code}: ${error.message}` : String(error.code);
}

async function unwrap<T>(promise: Promise<RemoteResultLike<T>>): Promise<T> {
  const result = await promise;
  if (result === undefined || result.ok !== true) {
    throw new Error(remoteErrorText(result?.error));
  }
  return result.value as T;
}

function adaptPluginManager(remote: RawPluginManagerRemote): PluginManagerRemote {
  return {
    listPlugins: () => unwrap(remote.listPlugins()),
    setPluginEnabled: (entryId: string, enabled: boolean) => unwrap(remote.setPluginEnabled(entryId, enabled)),
  };
}

export function apply(ctx: ClientContext): void {
  injectSharedStyles();
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "skill-manager: dictionaries");
  const t = ctx.locale.bind(NS);
  const pluginManager = (): PluginManagerRemote => {
    const remote = ctx.remote.pluginManager;
    if (remote === undefined) throw new Error("skill-manager: pluginManager remote unavailable");
    return adaptPluginManager(remote);
  };
  const onRemoteEvent = (event: string, listener: () => void): (() => void) => ctx.remote.$on(event, listener);
  ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: PANEL_ID,
    locale: NS,
    inject: (): PanelFace => ({
      t,
      pluginManager: pluginManager(),
      onRemoteEvent,
      workspaces: ctx.workspaces?.list.getSnapshot().items ?? [],
    }),
  }, SkillsPanelPage));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: PANEL_ID,
    order: 20,
    label: () => t("panel"),
    locale: NS,
  }, PanelIcon));
  ctx.inject(["slots", "sessions"], (scope) => {
    scope.slots.inject("conversation.input.left", () => scope.slots.register({
      name: "conversation.input.left",
      id: "workspace-skills",
      order: 0,
      locale: NS,
      inject: (sessionId: string): WorkspaceFace => ({
        t,
        cwd: scope.sessions?.list.getSnapshot().byId[sessionId]?.cwd,
        pluginManager: pluginManager(),
      }),
    }, WorkspaceControl));
  });
}

function PanelIcon({ size }: { size?: number }): ReactElement {
  return (
    <span style={{ display: "inline-flex" }}>
      <IconSkillOutlineRegular size={size ?? 18} />
    </span>
  );
}
