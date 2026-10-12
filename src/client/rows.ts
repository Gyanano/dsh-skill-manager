import type { ChangeResult, PluginRow, SkillView } from "./api";
import { metaText, serverNameOf } from "./api";

export interface RowLabels {
  globalDisabled: string;
  invalid: string;
  readOnly: string;
  bundled: string;
  runtime: string;
  project: string;
  custom: string;
  user: string;
  globalEnabled: (state: string) => string;
  enabled: string;
  disabled: string;
}

export function sourceBadge(source: string, labels: RowLabels): string {
  switch (source) {
    case "project-dsh":
    case "project-agents":
      return labels.project;
    case "custom":
      return labels.custom;
    case "user-dsh":
    case "user-agents":
      return labels.user;
    case "bundled":
      return labels.bundled;
    default:
      return labels.runtime;
  }
}

export function skillBadges(skill: SkillView, labels: RowLabels): Array<{ text: string; tone: "plain" | "warn" | "ok" }> {
  const badges: Array<{ text: string; tone: "plain" | "warn" | "ok" }> = [
    { text: sourceBadge(skill.source, labels), tone: "plain" },
  ];
  if (skill.disabled) badges.push({ text: labels.globalDisabled, tone: "warn" });
  if (skill.parseError !== undefined) badges.push({ text: labels.invalid, tone: "warn" });
  if (skill.readOnly) badges.push({ text: labels.readOnly, tone: "plain" });
  if (skill.workspaceDisabled === true) badges.push({ text: labels.disabled, tone: "warn" });
  if (skill.workspaceDisabled === false && skill.source.startsWith("project-")) badges.push({ text: labels.enabled, tone: "ok" });
  return badges;
}

export function mcpTitle(row: PluginRow): string {
  const entryId = row.entryId ?? "";
  return metaText(row.meta?.title, serverNameOf(entryId));
}

export function changeNotice(result: ChangeResult, copy: {
  applied: string;
  restartRequired: string;
  overridden: string;
  failed: string;
}): string {
  switch (result.application) {
    case "applied":
      return copy.applied;
    case "restart-required":
      return copy.restartRequired;
    case "overridden":
      return copy.overridden;
    default:
      return result.error !== undefined ? `${copy.failed}: ${result.error.code}` : copy.failed;
  }
}
