export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type CharacterStatus =
  | 'pending_assembly'
  | 'pending_demo'
  | 'need_parts'
  | 'ready_to_pack'
  | 'completed';

export type HandoverStatus =
  | 'not_checked'
  | 'confirmed'
  | 'follow_up'
  | 'has_risk';

export interface AccessoryGap {
  name: string;
  required: number;
  available: number;
}

export interface Character {
  id: string;
  name: string;
  story: string;
  linkCount: number;
  accessoryStatus: string;
  demoOrder: number;
  owner: string;
  riskLevel: RiskLevel;
  riskNote: string;
  repairNote: string;
  status: CharacterStatus;
  missingAccessories: AccessoryGap[];
  operationReminders: string[];
  handoverStatus: HandoverStatus;
  handoverNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface FilterOptions {
  story: string;
  owner: string;
  status: CharacterStatus[];
  riskLevel: RiskLevel[];
  orderMin: number | null;
  orderMax: number | null;
}

export interface CheckResult {
  type: 'error' | 'warning' | 'info';
  message: string;
  characterIds: string[];
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export const STATUS_LABELS: Record<CharacterStatus, string> = {
  pending_assembly: '待装配',
  pending_demo: '待演示',
  need_parts: '需补件',
  ready_to_pack: '可封箱',
  completed: '已完成',
};

export const BATCH_STATUSES: CharacterStatus[] = [
  'pending_assembly',
  'pending_demo',
  'need_parts',
  'ready_to_pack',
];

export function normalizeCharacter(raw: any): Character {
  const riskLevels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
  const statuses: CharacterStatus[] = [
    'pending_assembly',
    'pending_demo',
    'need_parts',
    'ready_to_pack',
    'completed',
  ];
  const handoverStatuses: HandoverStatus[] = [
    'not_checked',
    'confirmed',
    'follow_up',
    'has_risk',
  ];

  const now = new Date().toISOString();
  const safeStr = (v: any, fallback = ''): string =>
    typeof v === 'string' ? v : v != null ? String(v) : fallback;
  const safeNum = (v: any, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const safeArr = <T>(v: any, fallback: T[]): T[] =>
    Array.isArray(v) ? v : fallback;

  const risk = safeStr(raw?.riskLevel, 'low');
  const st = safeStr(raw?.status, 'pending_assembly');
  const hs = safeStr(raw?.handoverStatus, 'not_checked');

  return {
    id: safeStr(raw?.id, 'char_' + Math.random().toString(36).slice(2, 12)),
    name: safeStr(raw?.name, '未命名角色'),
    story: safeStr(raw?.story, '未分类'),
    linkCount: safeNum(raw?.linkCount, 0),
    accessoryStatus: safeStr(raw?.accessoryStatus, ''),
    demoOrder: Math.max(1, safeNum(raw?.demoOrder, 1)),
    owner: safeStr(raw?.owner, ''),
    riskLevel: riskLevels.includes(risk as RiskLevel) ? (risk as RiskLevel) : 'low',
    riskNote: safeStr(raw?.riskNote, ''),
    repairNote: safeStr(raw?.repairNote, ''),
    status: statuses.includes(st as CharacterStatus) ? (st as CharacterStatus) : 'pending_assembly',
    missingAccessories: safeArr(raw?.missingAccessories, []).map((a: any) => ({
      name: safeStr(a?.name, '未命名配件'),
      required: Math.max(0, safeNum(a?.required, 0)),
      available: Math.max(0, safeNum(a?.available, 0)),
    })),
    operationReminders: safeArr(raw?.operationReminders, []).map((r: any) => safeStr(r, '')).filter(Boolean),
    handoverStatus: handoverStatuses.includes(hs as HandoverStatus) ? (hs as HandoverStatus) : 'not_checked',
    handoverNote: safeStr(raw?.handoverNote, ''),
    createdAt: safeStr(raw?.createdAt, now),
    updatedAt: safeStr(raw?.updatedAt, now),
  };
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '极高风险',
};

export const HANDOVER_LABELS: Record<HandoverStatus, string> = {
  not_checked: '未核对',
  confirmed: '可交接',
  follow_up: '需跟进',
  has_risk: '存在风险',
};

export type RehearsalStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type RehearsalResult = 'not_started' | 'pass' | 'fail' | 'need_rehearse';

export interface RehearsalCharacter {
  characterId: string;
  order: number;
  rehearsalResult: RehearsalResult;
  rehearsalNote: string;
  checkedBy: string;
}

export interface RehearsalPlan {
  id: string;
  name: string;
  story: string;
  venue: string;
  scheduledAt: string;
  owner: string;
  status: RehearsalStatus;
  characters: RehearsalCharacter[];
  problemNotes: string;
  summaryNote: string;
  createdAt: string;
  updatedAt: string;
}

export const REHEARSAL_STATUS_LABELS: Record<RehearsalStatus, string> = {
  draft: '草稿',
  scheduled: '已排期',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

export const REHEARSAL_RESULT_LABELS: Record<RehearsalResult, string> = {
  not_started: '未开始',
  pass: '通过',
  fail: '未通过',
  need_rehearse: '需复排',
};

export function normalizeRehearsalPlan(raw: any): RehearsalPlan {
  const statuses: RehearsalStatus[] = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'];
  const results: RehearsalResult[] = ['not_started', 'pass', 'fail', 'need_rehearse'];

  const now = new Date().toISOString();
  const safeStr = (v: any, fallback = ''): string =>
    typeof v === 'string' ? v : v != null ? String(v) : fallback;
  const safeArr = <T>(v: any, fallback: T[]): T[] =>
    Array.isArray(v) ? v : fallback;

  const status = safeStr(raw?.status, 'draft');
  const chars = safeArr(raw?.characters, []);

  return {
    id: safeStr(raw?.id, 'rh_' + Math.random().toString(36).slice(2, 12)),
    name: safeStr(raw?.name, '未命名排练场次'),
    story: safeStr(raw?.story, '未分类'),
    venue: safeStr(raw?.venue, ''),
    scheduledAt: safeStr(raw?.scheduledAt, now),
    owner: safeStr(raw?.owner, ''),
    status: statuses.includes(status as RehearsalStatus) ? (status as RehearsalStatus) : 'draft',
    characters: chars.map((c: any) => {
      const res = safeStr(c?.rehearsalResult, 'not_started');
      return {
        characterId: safeStr(c?.characterId, ''),
        order: Math.max(1, Number(c?.order) || 1),
        rehearsalResult: results.includes(res as RehearsalResult) ? (res as RehearsalResult) : 'not_started',
        rehearsalNote: safeStr(c?.rehearsalNote, ''),
        checkedBy: safeStr(c?.checkedBy, ''),
      };
    }).filter((c: RehearsalCharacter) => c.characterId),
    problemNotes: safeStr(raw?.problemNotes, ''),
    summaryNote: safeStr(raw?.summaryNote, ''),
    createdAt: safeStr(raw?.createdAt, now),
    updatedAt: safeStr(raw?.updatedAt, now),
  };
}
