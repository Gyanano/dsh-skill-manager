const STYLE_ID = "dsh-skill-manager/shared.css";

const CSS = `
.dsm-root { box-sizing: border-box; height: 100%; color: var(--dsw-alias-label-primary); flex-direction: column; align-items: center; gap: 32px; padding: 0 clamp(24px, 4vw, 48px) 48px; display: flex; overflow: auto; }
.dsm-root > * { width: 100%; max-width: 960px; }
.dsm-pageHead { box-sizing: border-box; justify-content: space-between; align-items: flex-start; gap: 16px; padding-top: 28px; display: flex; }
.dsm-pageTitle { margin: 0; font-size: 20px; font-weight: 500; line-height: 28px; }
.dsm-pageIntro { color: var(--dsw-alias-label-secondary); align-items: center; gap: 4px; margin: 4px 0 0; font-size: 13px; line-height: 20px; display: flex; }
.dsm-infoButton { width: 20px; height: 20px; color: var(--dsw-alias-label-caption); flex: none; padding: 0; }
.dsm-toolbar { justify-content: flex-end; align-items: center; gap: 16px; display: flex; }
.dsm-iconButton { border-radius: var(--dsw-radius-sm); width: 28px; height: 28px; color: var(--dsw-alias-label-caption); cursor: pointer; background: 0 0; border: 0; justify-content: center; align-items: center; display: inline-flex; }
.dsm-iconButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
.dsm-iconButton:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.dsm-iconWrap { display: inline-flex; }
.dsm-tabs { display: flex; gap: 16px; }
.dsm-tab { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-tertiary); font-size: 14px; font-weight: 500; line-height: 22px; padding: 4px 2px; cursor: pointer; border-bottom: 2px solid transparent; }
.dsm-tab:hover { color: var(--dsw-alias-label-secondary); }
.dsm-tab[data-active="true"] { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-brand-primary); }
.dsm-list { display: flex; flex-direction: column; gap: 2px; }
.dsm-row { display: flex; align-items: center; gap: 14px; padding: 8px; border-radius: var(--dsw-radius-xl); margin: 0 -8px; min-width: 0; }
.dsm-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsm-row[data-disabled="true"] { opacity: 0.45; }
.dsm-row[data-disabled="true"] .dsm-row-name { color: var(--dsw-alias-label-tertiary); text-decoration: line-through; text-decoration-color: var(--dsw-alias-label-caption); text-decoration-thickness: 1px; }
.dsm-row-main { flex: 1; min-width: 0; }
.dsm-row-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dsm-row-name { text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; line-height: 20px; overflow: hidden; }
.dsm-row-desc { color: var(--dsw-alias-label-tertiary); -webkit-line-clamp: 1; -webkit-box-orient: vertical; font-size: 13px; line-height: 18px; display: -webkit-box; overflow: hidden; }
.dsm-badge { flex: none; height: 18px; padding: 0 7px; font-size: 10px; line-height: 1; display: inline-flex; align-items: center; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l); color: var(--dsw-alias-label-tertiary); }
.dsm-badge[data-tone="warn"] { color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-tertiary)); }
.dsm-badge[data-tone="ok"] { color: var(--dsw-alias-state-business-primary, var(--dsw-alias-label-tertiary)); }
.dsm-dot { flex: none; width: 8px; height: 8px; border-radius: 999px; background: var(--dsw-alias-label-caption); }
.dsm-dot-ok { background: var(--dsw-alias-state-success-primary, #2e9e5b); }
.dsm-dot-bad { background: var(--dsw-alias-state-error-primary, #e5484d); }
.dsm-dot-off { opacity: 0.5; }
.dsm-state { flex: none; color: var(--dsw-alias-label-tertiary); margin: 0; font-size: 13px; line-height: 20px; }
.dsm-error { color: var(--dsw-alias-state-error-primary, #e5484d); margin: 0; font-size: 13px; line-height: 20px; }
.dsm-muted { color: var(--dsw-alias-label-tertiary); margin: 0; font-size: 13px; line-height: 20px; }
.dsm-section { margin: 0; font-size: 14px; font-weight: 500; line-height: 22px; }
.dsm-trigger { position: relative; display: inline-flex; }
.dsm-trigger > button { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-tertiary); width: 28px; height: 28px; border-radius: var(--dsw-radius-sm); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.dsm-trigger > button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsm-pop { background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l); border-radius: var(--dsw-radius-md, 8px); box-shadow: var(--dsw-elevation-prominent); padding: 12px; font-size: 13px; text-align: left; color: var(--dsw-alias-label-primary); }
.dsm-search { box-sizing: border-box; width: 100%; margin-bottom: 10px; padding: 6px 10px; font-size: 13px; line-height: 20px; background: var(--dsw-alias-interactive-bg-subtle, transparent); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l); border-radius: var(--dsw-radius-md, 8px); outline: none; }
.dsm-search:hover { border-color: var(--dsw-alias-border-m, var(--dsw-alias-border-l)); }
.dsm-search:focus { border-color: var(--dsw-alias-brand-primary); }
.dsm-search::placeholder { color: var(--dsw-alias-label-caption); }
.dsm-form { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--dsw-alias-border-l); border-radius: var(--dsw-radius-md, 8px); margin-bottom: 12px; }
.dsm-input { box-sizing: border-box; width: 100%; padding: 6px 10px; font-size: 13px; line-height: 20px; background: transparent; color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l); border-radius: var(--dsw-radius-sm); outline: none; }
.dsm-input:focus { border-color: var(--dsw-alias-brand-primary); }
.dsm-input::placeholder { color: var(--dsw-alias-label-caption); }
.dsm-fieldLabel { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsm-formActions { display: flex; justify-content: flex-end; gap: 8px; }
.dsm-importCandidates { max-height: 40vh; overflow: auto; padding: 0 8px; }
.dsm-modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 90; }
.dsm-modal { box-sizing: border-box; width: min(520px, 86vw); max-height: min(560px, 80vh); overflow-y: auto; display: flex; flex-direction: column; gap: 8px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l); border-radius: var(--dsw-radius-lg, 12px); box-shadow: var(--dsw-elevation-prominent); padding: 16px; color: var(--dsw-alias-label-primary); font-size: 13px; text-align: left; }
.dsm-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dsm-modal-title { font-size: 16px; font-weight: 500; line-height: 24px; }
.dsm-kindSwitch { display: flex; gap: 16px; }
.dsm-textarea { resize: vertical; font-family: var(--dsw-font-mono, monospace); font-size: 12px; line-height: 18px; }
.dsm-pop-header { font-size: 14px; font-weight: 500; line-height: 22px; margin-bottom: 2px; }
.dsm-pop-path { color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px; margin-bottom: 8px; word-break: break-all; }
.dsm-pop .dsm-row { padding: 8px; gap: 10px; }
.dsm-pop-note { color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px; margin: 4px 0 8px; }
.dsm-pop-footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l); color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px; }
.dsm-mini { appearance: none; border: 1px solid var(--dsw-alias-border-l); background: transparent; color: var(--dsw-alias-label-tertiary); border-radius: 999px; font-size: 11px; padding: 2px 8px; cursor: pointer; flex: none; }
.dsm-mini:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsm-addButton { border-radius: var(--dsw-radius-md); height: 32px; padding: 0 12px; font-size: 13px; line-height: 20px; }
`;

export function injectSharedStyles(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-skill-manager";
  tag.dataset.pluginCss = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
