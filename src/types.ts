export interface SkillInvocation {
  modelInvocable: boolean;
  userInvocable: boolean;
}

export interface HostContext {
  get(key: string): unknown;
  inject(services: string[], callback: (scoped: HostContext) => void): void;
  on(event: string, listener: (exec: ToolExec, next: () => unknown) => unknown): () => void;
  effect(callback: () => unknown, label: string): () => void;
  skills?: {
    list(options?: { cwd?: string }): Promise<RegistrySkillSummary[]>;
  };
}

export interface RegistrySkillSummary {
  name: string;
  description: string;
  whenToUse?: string;
  invocation: SkillInvocation;
  source: string;
  provider: string;
  path?: string;
}

export interface ToolExec {
  name?: string;
  arguments?: Record<string, unknown>;
  agent?: {
    session?: {
      header?: {
        cwd?: string;
      };
    };
  };
}
