declare module "@deepseek-ai/dsh-client-ui-primitives" {
  import type { ComponentType, ReactElement, ReactNode } from "react";

  export const IconSkillOutlineRegular: ComponentType<{ size?: number }>;
  export const IconSettingsOutlineRegular: ComponentType<{ size?: number }>;
  export const IconInfoOutlineRegular: ComponentType<{ size?: number; "aria-hidden"?: boolean | string }>;
  export const IconRefreshOutlineRegular: ComponentType<Record<string, never>>;
  export const Switch: ComponentType<{
    checked: boolean;
    disabled?: boolean;
    label?: string;
    title?: string;
    onChange: (next: boolean) => void;
  }>;
  export const StateDot: ComponentType<{ state: string; size?: number }>;
  export const Tooltip: ComponentType<{
    label: ReactNode;
    children: ReactElement;
    side?: "top" | "bottom" | "left" | "right";
    delayMs?: number;
    focusDelayMs?: number;
    maxWidth?: number;
    portal?: boolean;
    openOnClick?: boolean;
    disabled?: boolean;
  }>;
  export const Button: ComponentType<{
    variant?: "ghost" | "primary";
    size?: "sm";
    className?: string;
    icon?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    children: ReactNode;
  }>;
}
