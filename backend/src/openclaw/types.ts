export interface OpenClawSkill {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface OpenClawSkillContext {
  topicId: string;
  log: (message: string) => void;
}
