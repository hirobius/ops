// Shared types for client/* JSON files consumed by /ops dashboard surfaces.
// Fields marked optional (`?`) are absent in at least one client at time of
// authoring; required fields are present in all (lilac-insure, the-ranch-foundation,
// prospect-001). Source of truth: clients/<slug>/{meta,tasks,checklist,retainer,goals}.json.

interface ClientContact {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

interface ClientScale {
  employees?: string;
  customers?: number | null;
  policies?: number | null;
  team?: string;
  revenue?: string;
  geography?: string;
}

interface ClientPortalUrl {
  staging?: string;
  prod?: string;
  draft?: string;
}

interface ClientFigmaFileUrl {
  master?: string;
  client?: string;
  draft?: string;
}

export interface ClientMeta {
  id: string;
  name: string;
  status: string;
  type: string;
  engagementType: string;
  startDate: string;
  location: string;
  website: string;
  contact: ClientContact;
  scale: ClientScale;
  portalUrl: ClientPortalUrl;
  figmaFileUrl: ClientFigmaFileUrl;
  serviceModel?: string;
  domains?: string[];
  driveDocId?: string;
  driveFolder?: string;
  missionStatement?: string;
  notes?: string;
  recordingDriveId?: string;
  recordingDrivePath?: string;
  recordingNote?: string;
  referredBy?: string;
  websitePlatform?: string;
}

// Agent routing fields are optional — populated by the auto-assigner (Gemma 4
// E4B variant of the Ramble Processor) or set manually. `assignee` is the
// current executor (model tier or human handle); `owner` remains the
// responsible party. `dispatchState` runs independently of `status` so the
// agent execution lifecycle doesn't collide with the human-facing kanban state.
export type ClientTaskAssignee =
  | 'gemma4-e4b'
  | 'gemma4-26b'
  | 'haiku'
  | 'sonnet'
  | 'opus'
  | 'human'
  | string;

export type ClientTaskEffort = 'min' | 'standard' | 'high';

export type ClientTaskDispatchState =
  | 'unassigned'
  | 'queued'
  | 'running'
  | 'awaiting-review'
  | 'failed'
  | 'done';

export interface ClientTask {
  id: string;
  title: string;
  status: string;
  owner: string;
  priority?: number | string;
  blockedReason?: string;
  notes?: string;

  // Agent routing — who/what executes this task right now
  assignee?: ClientTaskAssignee;
  model?: string;
  effort?: ClientTaskEffort;
  costCeiling?: number;
  costSpent?: number;

  // Dispatch lifecycle (independent of human-facing `status`)
  dispatchState?: ClientTaskDispatchState;
  lastDispatchAt?: string;
  lastDispatchOutput?: string;

  // Routing audit — every assigner decision logged here, not just in routing-log.jsonl
  routedBy?: string;
  routedAt?: string;
  routingRationale?: string;

  // Graph structure — preserved cheaply so a DAG/graph view doesn't require migration
  dependsOn?: string[];
  subtasks?: string[];
  parentTaskId?: string;

  // Cross-link to an automation workflow that implements this task. Path is
  // relative to clients/<slug>/. Dashboard renders a small "🤖 wired" badge
  // and the automations panel shows reverse links back to the task.
  automationRef?: string;
}

interface ClientSwimlane {
  id: string;
  name: string;
  goal: string;
  tasks: ClientTask[];
  focus?: string;
}

interface ClientPhase {
  id: string;
  name: string;
  status: string;
  description: string;
  budget: number | null;
  // Phases may use swimlanes (Phase 1 style: id 1-1, 1-2 nested under buckets)
  // OR a flat tasks list (Phase 2/3 style: ai-1, ai-2 directly on phase). At
  // least one is present in practice; both are optional in the schema.
  swimlanes?: ClientSwimlane[];
  tasks?: ClientTask[];
  scopedAt?: number;
}

export interface ClientTasksFile {
  phases?: ClientPhase[];
}

interface ClientChecklistItem {
  id: string;
  item: string;
  status: string;
  notes?: string;
  owner?: string;
  blockedReason?: string;
}

interface ClientChecklistCategory {
  id: string;
  name: string;
  items: ClientChecklistItem[];
}

export interface ClientChecklistFile {
  categories?: ClientChecklistCategory[];
}

interface ClientFutureTier {
  tier: string;
  estimatedScope: string;
  includes?: string[];
}

interface ClientRetainerPhase {
  phase: string;
  status: string;
  currency: string;
  scopedAt: number;
  includes?: string[];
  excludes?: string[];
}

export interface ClientRetainerFile {
  model?: string;
  description?: string;
  blockers?: string[];
  currentPhase?: ClientRetainerPhase;
  futureTiers?: ClientFutureTier[];
  hypothesisRationale?: string;
  packageHypothesis?: string;
  estimatedScope?: string;
  notes?: string;
  clarificationNeeded?: Record<string, unknown>;
}

interface ClientGoal {
  id: string;
  goal: string;
  status: string;
  metric?: string;
  horizon?: string;
  description?: string;
  notes?: string;
}

export interface ClientGoalsFile {
  micro?: ClientGoal[];
  macro?: ClientGoal[];
  aiOpportunities?: ClientGoal[];
}

// ── Automation surface (clients/<slug>/automation-config.json + automations/) ─

export interface ClientAutomationSystem {
  envKeys?: string[];
  status?: string;
  notes?: string;
}

export interface ClientAutomationLlm {
  provider?: 'ollama' | 'claude' | 'none' | string;
  ollama?: { endpoint?: string; model?: string; fallbackModels?: string[] };
  claude?: { envKey?: string; model?: string };
}

export interface ClientAutomationConfig {
  client?: string;
  mode?: 'test' | 'production' | string;
  testRecipient?: string;
  productionRecipients?: string[];
  logPath?: string;
  systems?: Record<string, ClientAutomationSystem>;
  llm?: ClientAutomationLlm;
  outlook?: {
    mailbox?: string;
    applyMode?: 'tag' | 'move' | 'both' | string;
    folders?: Record<string, string>;
    categoryTagPrefix?: string;
  };
}

export interface ClientWorkflowConfig {
  id: string;
  phase?: string;
  bucket?: string;
  systemsTouched?: string[];
  ownerSystem?: string;
  policy?: Record<string, unknown>;
  template?: Record<string, unknown>;
  sequence?: Array<Record<string, unknown>>;
  // Anything else lives under here — the dashboard reads only the typed fields.
  [extra: string]: unknown;
}

export interface ClientWorkflow {
  id: string;          // folder name, e.g. "lead-intake"
  config: ClientWorkflowConfig;
}

export interface ClientFiles {
  meta: ClientMeta;
  tasks?: ClientTasksFile;
  checklist?: ClientChecklistFile;
  retainer?: ClientRetainerFile;
  goals?: ClientGoalsFile;
  automationConfig?: ClientAutomationConfig;
  workflows?: ClientWorkflow[];
}
