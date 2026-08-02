import { ref, watch } from 'vue';
import type { Character, InspectionTask, InspectionSeverity, RehearsalPlan } from '../types';
import { normalizeInspectionTask, reissueDuplicateIds, REHEARSAL_RESULT_LABELS } from '../types';
import { generateMockInspectionTasks } from '../data/mockData';
import { useCharacters } from './useCharacters';

const STORAGE_KEY = 'shadow-puppetry-inspection-tasks';

function loadFromStorage(): InspectionTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(item => normalizeInspectionTask(item));
      }
    }
  } catch {
    console.warn('Failed to load inspection tasks from storage');
  }
  return generateMockInspectionTasks();
}

function saveToStorage(tasks: InspectionTask[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    console.warn('Failed to save inspection tasks to storage');
  }
}

const tasks = ref<InspectionTask[]>(loadFromStorage());

watch(tasks, (newVal) => {
  saveToStorage(newVal);
}, { deep: true });

function isClosedStatus(task: InspectionTask): boolean {
  return task.status === 'resolved' || task.status === 'dismissed' || task.status === 'blocked';
}

// ------- 自动任务统一规则（标题格式 / sourceType / sourceId），各页面与同步逻辑必须复用 -------
export function buildMissingPartTaskTitle(characterName: string, accessoryName: string): string {
  return `补齐${characterName}的${accessoryName}`;
}

export function buildRiskReviewTaskTitle(characterName: string): string {
  return `复核${characterName}风险说明`;
}

export function buildAssignOwnerTaskTitle(characterName: string): string {
  return `分配${characterName}责任人`;
}

export function buildHandoverBlockTaskTitle(characterName: string): string {
  return `处理${characterName}的交接风险`;
}

export function buildRehearsalFailTaskTitle(characterName: string): string {
  return `整改${characterName}排练未通过问题`;
}

export function buildRehearsalNeedRehearseTaskTitle(characterName: string): string {
  return `安排${characterName}复排`;
}

function appendNoteToDescription(description: string, note: string): string {
  if (!note) return description;
  if (!description) return note;
  return description.includes(note) ? description : `${description}；${note}`;
}

/** 角色客观风险原因（缺件 / 高风险 / 未分配责任人），用于交接拦截任务描述 */
export function getObjectiveRiskReasons(char: Character): string[] {
  const reasons: string[] = [];
  const gaps = char.missingAccessories
    .filter(a => a.available < a.required)
    .map(a => `${a.name}缺${a.required - a.available}`);
  if (gaps.length > 0) reasons.push(`缺件：${gaps.join('，')}`);
  if (char.riskLevel === 'high' || char.riskLevel === 'critical') {
    reasons.push(`高风险：${char.riskNote || '需复核风险说明'}`);
  }
  if (!char.owner.trim()) reasons.push('未分配责任人');
  return reasons;
}

function missingPartSeverity(char: Character): InspectionSeverity {
  if (char.riskLevel === 'critical') return 'critical';
  if (char.riskLevel === 'high') return 'high';
  return 'medium';
}

type AutoTaskPayload = Omit<InspectionTask, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * 根据角色风险项（缺件 / 极高风险 / 未指定责任人）构造自动任务载荷，
 * 标题格式与 sourceType/sourceId 规则与巡检任务中心保持一致，不允许另建字段。
 */
export function buildAutoTaskPayloadsForCharacter(char: Character): AutoTaskPayload[] {
  const payloads: AutoTaskPayload[] = [];

  char.missingAccessories.forEach(acc => {
    if (acc.available >= acc.required) return;
    payloads.push({
      sourceType: 'character',
      sourceId: char.id,
      story: char.story,
      characterId: char.id,
      planId: '',
      title: buildMissingPartTaskTitle(char.name, acc.name),
      description: `${char.name}缺少配件「${acc.name}」${acc.required - acc.available} 件（需要 ${acc.required}，现有 ${acc.available}）`,
      severity: missingPartSeverity(char),
      status: 'open',
      assignee: char.owner,
      dueAt: '',
      resolvedAt: '',
    });
  });

  if ((char.riskLevel === 'high' || char.riskLevel === 'critical') && char.riskNote) {
    payloads.push({
      sourceType: 'character',
      sourceId: char.id,
      story: char.story,
      characterId: char.id,
      planId: '',
      title: buildRiskReviewTaskTitle(char.name),
      description: `风险说明：${char.riskNote}${char.repairNote ? `；修补备注：${char.repairNote}` : ''}`,
      severity: char.riskLevel,
      status: 'open',
      assignee: char.owner,
      dueAt: '',
      resolvedAt: '',
    });
  }

  if (!char.owner.trim()) {
    payloads.push({
      sourceType: 'character',
      sourceId: char.id,
      story: char.story,
      characterId: char.id,
      planId: '',
      title: buildAssignOwnerTaskTitle(char.name),
      description: `${char.name}（出场顺序 ${char.demoOrder}）尚未指定责任人，请尽快分配`,
      severity: 'medium',
      status: 'open',
      assignee: '',
      dueAt: '',
      resolvedAt: '',
    });
  }

  return payloads;
}

/**
 * 将指定角色关联的未完结任务标记为 blocked（保留来源信息，不删除任务）。
 * 供角色删除、排练计划清理无效角色等场景调用。
 */
export function blockTasksByCharacterIds(characterIds: string[]): number {
  const idSet = new Set(characterIds.filter(Boolean));
  if (idSet.size === 0) return 0;
  let changed = 0;
  const now = new Date().toISOString();
  tasks.value = tasks.value.map(task => {
    if (task.characterId && idSet.has(task.characterId) && !isClosedStatus(task)) {
      changed++;
      return { ...task, status: 'blocked' as const, updatedAt: now };
    }
    return task;
  });
  return changed;
}

/**
 * 排练计划清理/移除角色时，将该计划下关联这些角色的未完结任务标记为 blocked，
 * 保留来源信息并在描述末尾追加说明（默认「角色已从排练计划移除」）。
 */
export function blockTasksByPlanCleanup(planId: string, characterIds: string[], note: string = '角色已从排练计划移除'): number {
  const idSet = new Set(characterIds.filter(Boolean));
  if (!planId || idSet.size === 0) return 0;
  let changed = 0;
  const now = new Date().toISOString();
  tasks.value = tasks.value.map(task => {
    if (task.planId === planId && task.characterId && idSet.has(task.characterId) && !isClosedStatus(task)) {
      changed++;
      return {
        ...task,
        status: 'blocked' as const,
        description: appendNoteToDescription(task.description, note),
        updatedAt: now,
      };
    }
    return task;
  });
  return changed;
}

export function useInspectionTasks() {
  const { characters } = useCharacters();

  function generateId(): string {
    return 'task_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function addTask(data: Omit<InspectionTask, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<InspectionTask, 'createdAt' | 'updatedAt'>>) {
    const now = new Date().toISOString();
    const newTask: InspectionTask = normalizeInspectionTask({
      ...data,
      id: generateId(),
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    });
    tasks.value.push(newTask);
    return newTask;
  }

  function updateTask(id: string, updates: Partial<InspectionTask>) {
    const index = tasks.value.findIndex(t => t.id === id);
    if (index !== -1) {
      const merged = {
        ...tasks.value[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      if (merged.status === 'resolved' && !merged.resolvedAt) {
        merged.resolvedAt = merged.updatedAt;
      }
      if (merged.status !== 'resolved') {
        merged.resolvedAt = '';
      }
      tasks.value[index] = normalizeInspectionTask(merged);
      return tasks.value[index];
    }
    return null;
  }

  function deleteTask(id: string) {
    const index = tasks.value.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks.value.splice(index, 1);
      return true;
    }
    return false;
  }

  function resolveTask(id: string) {
    return updateTask(id, { status: 'resolved', resolvedAt: new Date().toISOString() });
  }

  function getTasksByCharacterId(characterId: string): InspectionTask[] {
    return tasks.value.filter(t => t.characterId === characterId);
  }

  function getTasksByPlanId(planId: string): InspectionTask[] {
    return tasks.value.filter(t => t.planId === planId);
  }

  function getTasksByStory(story: string): InspectionTask[] {
    return tasks.value.filter(t => t.story === story);
  }

  function isUnresolved(task: InspectionTask): boolean {
    return task.status === 'open' || task.status === 'in_progress' || task.status === 'blocked';
  }

  function getUnresolvedTasksByCharacterId(characterId: string): InspectionTask[] {
    return getTasksByCharacterId(characterId).filter(isUnresolved);
  }

  function taskExists(characterId: string, title: string): boolean {
    return tasks.value.some(t => t.characterId === characterId && t.title === title);
  }

  /**
   * 为单个角色补齐缺失的自动任务（沿用统一标题格式与 sourceType/sourceId 规则）。
   * 只创建缺失任务，不覆盖已有任务。
   */
  function createAutoTasksForCharacter(char: Character): number {
    let created = 0;
    buildAutoTaskPayloadsForCharacter(char).forEach(payload => {
      if (taskExists(char.id, payload.title)) return;
      addTask(payload);
      created++;
    });
    return created;
  }

  /**
   * 角色从 need_parts 改为 ready_to_pack 时，返回可建议解决的补件任务。
   * 只包含自动生成的补件任务（非手工创建），且仅作建议，绝不自动关闭。
   */
  function getResolvableMissingPartTasks(char: Character): InspectionTask[] {
    const prefix = buildMissingPartTaskTitle(char.name, '');
    return tasks.value.filter(t =>
      t.characterId === char.id &&
      t.sourceType !== 'manual' &&
      t.title.startsWith(prefix) &&
      (t.status === 'open' || t.status === 'in_progress')
    );
  }

  function handoverBlockSeverity(char: Character): InspectionSeverity {
    if (char.riskLevel === 'critical') return 'critical';
    if (char.riskLevel === 'high') return 'high';
    return 'medium';
  }

  /** 查找角色关联的未解决交接任务（sourceType='handover'，sourceId=角色 id） */
  function findOpenHandoverTask(characterId: string): InspectionTask | undefined {
    return tasks.value.find(t =>
      t.sourceType === 'handover' &&
      t.sourceId === characterId &&
      t.characterId === characterId &&
      (t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked')
    );
  }

  /**
   * 客观风险角色被拦截标记 confirmed 时调用：创建或更新 sourceType='handover'、
   * sourceId=角色 id 的巡检任务，story/characterId 可反查。
   * 负责人默认取角色 owner；owner 为空时保持空值，并确保存在「分配{角色名}责任人」任务。
   */
  function upsertHandoverBlockTask(char: Character): { task: InspectionTask; created: boolean } {
    const reasons = getObjectiveRiskReasons(char);
    const reasonText = reasons.length > 0 ? reasons.join('；') : '存在客观风险';
    const description = `交接核对拦截：${reasonText}，不允许标记为可交接${char.handoverNote ? `。交接备注：${char.handoverNote}` : ''}`;
    const existing = findOpenHandoverTask(char.id);
    if (existing) {
      const updated = updateTask(existing.id, {
        story: char.story,
        description,
        severity: handoverBlockSeverity(char),
        assignee: existing.assignee || char.owner,
      })!;
      return { task: updated, created: false };
    }
    const task = addTask({
      sourceType: 'handover',
      sourceId: char.id,
      story: char.story,
      characterId: char.id,
      planId: '',
      title: buildHandoverBlockTaskTitle(char.name),
      description,
      severity: handoverBlockSeverity(char),
      status: 'open',
      assignee: char.owner,
      dueAt: '',
      resolvedAt: '',
    });
    if (!char.owner.trim()) {
      // 沿用统一自动任务规则生成「分配{角色名}责任人」任务
      createAutoTasksForCharacter(char);
    }
    return { task, created: true };
  }

  /**
   * 把角色交接备注同步为关联交接任务的描述；无交接任务时按统一规则新建。
   * 备注为空时返回 null。
   */
  function syncHandoverNoteToTask(char: Character): InspectionTask | null {
    const note = char.handoverNote.trim();
    if (!note) return null;
    const existing = findOpenHandoverTask(char.id);
    if (existing) {
      return updateTask(existing.id, { story: char.story, description: note });
    }
    const task = addTask({
      sourceType: 'handover',
      sourceId: char.id,
      story: char.story,
      characterId: char.id,
      planId: '',
      title: buildHandoverBlockTaskTitle(char.name),
      description: note,
      severity: handoverBlockSeverity(char),
      status: 'open',
      assignee: char.owner,
      dueAt: '',
      resolvedAt: '',
    });
    if (!char.owner.trim()) {
      createAutoTasksForCharacter(char);
    }
    return task;
  }

  /**
   * 排练结果闭环：fail 生成高严重度任务，need_rehearse 生成中严重度任务。
   * sourceType='rehearsal'、sourceId=排练计划 id，planId/characterId 均写入；
   * 严格只补缺（按计划+角色+标题去重），不覆盖用户已编辑的 status/assignee/dueAt/description。
   */
  function syncTaskFromRehearsalResult(plan: RehearsalPlan, characterId: string): { task: InspectionTask | null; created: boolean } {
    const rc = plan.characters.find(c => c.characterId === characterId);
    if (!rc) return { task: null, created: false };

    const severity: InspectionSeverity | null =
      rc.rehearsalResult === 'fail' ? 'high'
        : rc.rehearsalResult === 'need_rehearse' ? 'medium'
          : null;
    if (!severity) return { task: null, created: false };

    const char = characters.value.find(c => c.id === characterId);
    const charName = char?.name || '未知角色';
    const title = rc.rehearsalResult === 'fail'
      ? buildRehearsalFailTaskTitle(charName)
      : buildRehearsalNeedRehearseTaskTitle(charName);

    const existing = tasks.value.find(t =>
      t.sourceType === 'rehearsal' &&
      t.sourceId === plan.id &&
      t.planId === plan.id &&
      t.characterId === characterId &&
      t.title === title
    );
    if (existing) return { task: existing, created: false };

    const task = addTask({
      sourceType: 'rehearsal',
      sourceId: plan.id,
      story: plan.story,
      characterId,
      planId: plan.id,
      title,
      description: `排练计划「${plan.name}」中${charName}标记为「${REHEARSAL_RESULT_LABELS[rc.rehearsalResult]}」${rc.rehearsalNote ? `：${rc.rehearsalNote}` : ''}`,
      severity,
      status: 'open',
      assignee: char?.owner || plan.owner,
      dueAt: '',
      resolvedAt: '',
    });
    return { task, created: true };
  }

  /**
   * 从数组恢复巡检任务（备份包恢复用）：逐条 normalizeInspectionTask，
   * 任务字段固定为 InspectionTask 的 camelCase schema，重复 id 自动重建。
   */
  function restoreTasks(list: any[]): { count: number; invalidCount: number; reissuedCount: number } {
    const normalized: InspectionTask[] = [];
    let invalidCount = 0;
    list.forEach((item) => {
      if (!item || typeof item !== 'object') {
        invalidCount++;
        return;
      }
      try {
        normalized.push(normalizeInspectionTask(item));
      } catch {
        invalidCount++;
      }
    });
    const { items, reissued } = reissueDuplicateIds(normalized, 'task');
    tasks.value = items;
    return { count: items.length, invalidCount, reissuedCount: reissued };
  }

  /**
   * 备份包恢复后的一致性校验：关联的 characterId 或 planId 不存在时，
   * 任务标记为 blocked，仍保留 sourceType/sourceId/story。返回阻塞数量。
   */
  function validateTaskConsistency(validCharacterIds: Set<string>, validPlanIds: Set<string>): number {
    let blocked = 0;
    const now = new Date().toISOString();
    tasks.value = tasks.value.map(task => {
      const characterMissing = !!task.characterId && !validCharacterIds.has(task.characterId);
      const planMissing = !!task.planId && !validPlanIds.has(task.planId);
      if ((characterMissing || planMissing) && !isClosedStatus(task)) {
        blocked++;
        return { ...task, status: 'blocked' as const, updatedAt: now };
      }
      return task;
    });
    return blocked;
  }

  /**
   * 从角色清单同步风险项为巡检任务。
   * 只创建缺失任务，不覆盖用户已改过的 status、assignee、dueAt、description；
   * 角色被删除时关联任务进入 blocked 并保留来源信息。
   */
  function syncTasksFromCharacters(list?: Character[]): { created: number; blocked: number } {
    const chars = list ?? characters.value;
    const now = new Date().toISOString();

    // 1. 角色被删除：关联任务不能丢失，进入 blocked 并保留来源信息
    const validIds = new Set(chars.map(c => c.id));
    let blocked = 0;
    tasks.value = tasks.value.map(task => {
      if (task.characterId && !validIds.has(task.characterId) && !isClosedStatus(task)) {
        blocked++;
        return { ...task, status: 'blocked' as const, updatedAt: now };
      }
      return task;
    });

    // 2. 只创建缺失任务：按 角色 + 标题 判断任务是否已存在
    let created = 0;
    chars.forEach(char => {
      buildAutoTaskPayloadsForCharacter(char).forEach(payload => {
        if (taskExists(char.id, payload.title)) return;
        addTask(payload);
        created++;
      });
    });

    return { created, blocked };
  }

  // 首次使用时完成初始化：立即同步一次，并监听角色变化自动同步
  if (!initialized) {
    initialized = true;
    syncTasksFromCharacters();
    watch(characters, () => {
      syncTasksFromCharacters();
    }, { deep: true });
  }

  return {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    resolveTask,
    getTasksByCharacterId,
    getTasksByPlanId,
    getTasksByStory,
    syncTasksFromCharacters,
    getUnresolvedTasksByCharacterId,
    createAutoTasksForCharacter,
    getResolvableMissingPartTasks,
    upsertHandoverBlockTask,
    syncHandoverNoteToTask,
    syncTaskFromRehearsalResult,
    restoreTasks,
    validateTaskConsistency,
  };
}

let initialized = false;
