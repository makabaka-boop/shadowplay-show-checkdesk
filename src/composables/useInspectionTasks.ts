import { ref, watch } from 'vue';
import type { Character, InspectionTask, InspectionSeverity, InspectionStatus, RehearsalResult } from '../types';
import { normalizeInspectionTask, reissueDuplicateIds } from '../types';
import { mockInspectionTasks } from '../data/mockData';

const STORAGE_KEY = 'shadow-puppetry-inspection-tasks';

// ==================== 任务标题构造（PRD 固定格式） ====================

export function buildMissingAccessoryTitle(characterName: string, accessoryName: string): string {
  return `补齐${characterName}的${accessoryName}`;
}

export function buildHighRiskTitle(characterName: string): string {
  return `复核${characterName}风险说明`;
}

export function buildUnassignedOwnerTitle(characterName: string): string {
  return `分配${characterName}责任人`;
}

export function buildHandoverBlockTaskTitle(characterName: string): string {
  return `核对${characterName}交接风险`;
}

export function buildRehearsalFailTitle(characterName: string): string {
  return `复排${characterName}（排练未通过）`;
}

export function buildRehearsalNeedRehearseTitle(characterName: string): string {
  return `复排${characterName}（需复排）`;
}

// 客观风险原因（缺件 / 高风险 / 未分配责任人），用于任务描述与拦截提示
export function getObjectiveRiskReasons(char: Character): string[] {
  const reasons: string[] = [];
  const gaps = char.missingAccessories.filter(a => a.available < a.required);
  if (gaps.length > 0) {
    reasons.push(`缺件：${gaps.map(a => `${a.name}缺${a.required - a.available}`).join('，')}`);
  }
  if (char.riskLevel === 'high' || char.riskLevel === 'critical') {
    reasons.push(`高风险：${char.riskNote || '该角色被标记为高风险'}`);
  }
  if (!char.owner) {
    reasons.push('未分配责任人');
  }
  return reasons;
}

// ==================== 持久化 ====================

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
  return mockInspectionTasks.map(item => normalizeInspectionTask(item));
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

function generateId(): string {
  return 'task_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 判断是否为用户已手动改动、自动同步不应覆盖的任务
function isUserTouched(task: InspectionTask): boolean {
  return task.status !== 'open' || !!task.assignee || !!task.dueAt;
}

export function useInspectionTasks() {
  function addTask(
    data: Partial<Omit<InspectionTask, 'id' | 'createdAt' | 'updatedAt'>>
  ): InspectionTask {
    const now = new Date().toISOString();
    const newTask = normalizeInspectionTask({
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    });
    tasks.value.push(newTask);
    return newTask;
  }

  function updateTask(id: string, updates: Partial<InspectionTask>): InspectionTask | null {
    const index = tasks.value.findIndex(t => t.id === id);
    if (index === -1) return null;
    tasks.value[index] = normalizeInspectionTask({
      ...tasks.value[index],
      ...updates,
      id: tasks.value[index].id,
      createdAt: tasks.value[index].createdAt,
      updatedAt: new Date().toISOString(),
    });
    return tasks.value[index];
  }

  function deleteTask(id: string): boolean {
    const index = tasks.value.findIndex(t => t.id === id);
    if (index === -1) return false;
    tasks.value.splice(index, 1);
    return true;
  }

  function resolveTask(id: string, resolver = ''): InspectionTask | null {
    const now = new Date().toISOString();
    return updateTask(id, {
      status: 'resolved',
      resolvedAt: now,
      ...(resolver ? { assignee: resolver } : {}),
    });
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

  // 判断同一角色来源任务是否已存在（按 characterId + sourceType 'character' + 标题匹配）
  function findCharacterTask(characterId: string, title: string): InspectionTask | undefined {
    return tasks.value.find(
      t => t.characterId === characterId && t.sourceType === 'character' && t.title === title
    );
  }

  // 为单个角色补齐自动任务（缺件 / 极高风险 / 未指定责任人）
  // 沿用巡检任务中心的标题格式与 sourceType='character'、sourceId=角色id 规则，只创建缺失任务
  function createAutoTasksForCharacter(char: Character): number {
    let created = 0;

    // 1) 缺件任务：available < required
    char.missingAccessories.forEach((acc) => {
      if (acc.available < acc.required) {
        const title = buildMissingAccessoryTitle(char.name, acc.name);
        if (!findCharacterTask(char.id, title)) {
          addTask({
            sourceType: 'character',
            sourceId: char.id,
            story: char.story,
            characterId: char.id,
            planId: '',
            title,
            description: `${acc.name}需补 ${acc.required - acc.available} 件（当前 ${acc.available}/${acc.required}）。`,
            severity: 'medium',
            status: 'open',
          });
          created++;
        }
      }
    });

    // 2) 高风险复核任务
    if (char.riskLevel === 'high' || char.riskLevel === 'critical') {
      const title = buildHighRiskTitle(char.name);
      if (!findCharacterTask(char.id, title)) {
        const severity: InspectionSeverity = char.riskLevel === 'critical' ? 'critical' : 'high';
        addTask({
          sourceType: 'character',
          sourceId: char.id,
          story: char.story,
          characterId: char.id,
          planId: '',
          title,
          description: char.riskNote || '该角色被标记为高风险，需复核风险说明。',
          severity,
          status: 'open',
        });
        created++;
      }
    }

    // 3) 未分配责任人任务
    if (!char.owner) {
      const title = buildUnassignedOwnerTitle(char.name);
      if (!findCharacterTask(char.id, title)) {
        addTask({
          sourceType: 'character',
          sourceId: char.id,
          story: char.story,
          characterId: char.id,
          planId: '',
          title,
          description: '该角色尚未指定责任人，需尽快安排。',
          severity: 'medium',
          status: 'open',
        });
        created++;
      }
    }

    return created;
  }

  // 自动从角色清单同步：只创建缺失任务，不覆盖用户已改过的字段
  function syncTasksFromCharacters(characters: Character[]): number {
    let created = 0;
    characters.forEach((char) => {
      created += createAutoTasksForCharacter(char);
    });
    // 静默使用 isUserTouched 保持“已同步任务不覆盖用户改动”语义一致（此处只创建不更新）
    void isUserTouched;
    return created;
  }

  const UNRESOLVED_STATUSES: InspectionStatus[] = ['open', 'in_progress', 'blocked'];

  // 某角色的未解决任务（open / in_progress / blocked）
  function getUnresolvedTasksByCharacterId(characterId: string): InspectionTask[] {
    return tasks.value.filter(
      t => t.characterId === characterId && UNRESOLVED_STATUSES.includes(t.status)
    );
  }

  // 某角色由系统自动生成、且尚未解决的补件任务（用于状态变更时的“建议解决”）
  // 仅匹配 sourceType='character' 且标题为“补齐{角色名}的…”，不会命中用户手写任务
  function getMissingPartTasksForCharacter(char: Character): InspectionTask[] {
    const prefix = `补齐${char.name}的`;
    return tasks.value.filter(
      t =>
        t.characterId === char.id &&
        t.sourceType === 'character' &&
        t.title.startsWith(prefix) &&
        (t.status === 'open' || t.status === 'in_progress')
    );
  }

  // ==================== 交接核对（sourceType='handover'） ====================

  // 某角色的交接来源任务（sourceType='handover'，sourceId=角色id）
  function getHandoverTasksByCharacterId(characterId: string): InspectionTask[] {
    return tasks.value.filter(
      t => t.characterId === characterId && t.sourceType === 'handover'
    );
  }

  // 找到该角色尚未解决的交接任务（用于复用而非重复创建）
  function findActiveHandoverTask(characterId: string): InspectionTask | undefined {
    return tasks.value.find(
      t =>
        t.characterId === characterId &&
        t.sourceType === 'handover' &&
        UNRESOLVED_STATUSES.includes(t.status)
    );
  }

  // 计算客观风险严重程度：critical 风险→critical；否则若缺件/高风险→high；仅未分配责任人→medium
  function handoverSeverityOf(char: Character): InspectionSeverity {
    if (char.riskLevel === 'critical') return 'critical';
    const hasMissingParts = char.missingAccessories.some(a => a.available < a.required);
    if (char.riskLevel === 'high' || hasMissingParts) return 'high';
    return 'medium';
  }

  // 拦截“可交接”时创建或更新交接任务
  // - sourceType='handover'，sourceId=角色id，story/characterId 可反查
  // - assignee 默认取角色 owner；为空则保持空值（另由缺人任务补齐）
  function upsertHandoverBlockTask(char: Character): InspectionTask {
    const reasons = getObjectiveRiskReasons(char);
    const description =
      `尝试标记为「可交接」被拦截。客观风险：\n- ${reasons.join('\n- ')}` +
      (char.handoverNote ? `\n交接备注：${char.handoverNote}` : '');
    const severity = handoverSeverityOf(char);

    // 未分配责任人时，额外生成“分配{角色名}责任人”任务（沿用 character 规则）
    if (!char.owner) {
      const ownerTitle = buildUnassignedOwnerTitle(char.name);
      if (!findCharacterTask(char.id, ownerTitle)) {
        addTask({
          sourceType: 'character',
          sourceId: char.id,
          story: char.story,
          characterId: char.id,
          planId: '',
          title: ownerTitle,
          description: '交接核对发现该角色尚未指定责任人，需尽快安排。',
          severity: 'medium',
          status: 'open',
        });
      }
    }

    const existing = findActiveHandoverTask(char.id);
    if (existing) {
      // 已有未解决交接任务：刷新描述、严重程度，并在负责人为空时补上 owner
      return (
        updateTask(existing.id, {
          story: char.story,
          description,
          severity,
          ...(existing.assignee ? {} : { assignee: char.owner || '' }),
        }) ?? existing
      );
    }

    return addTask({
      sourceType: 'handover',
      sourceId: char.id,
      story: char.story,
      characterId: char.id,
      planId: '',
      title: buildHandoverBlockTaskTitle(char.name),
      description,
      severity,
      status: 'open',
      assignee: char.owner || '',
    });
  }

  // 把交接备注同步为交接任务描述（保留客观风险原因段落）
  function syncHandoverNoteToTask(char: Character): InspectionTask | null {
    const existing = findActiveHandoverTask(char.id);
    if (!existing) return null;
    const reasons = getObjectiveRiskReasons(char);
    const description =
      `客观风险：\n- ${reasons.join('\n- ')}` +
      (char.handoverNote ? `\n交接备注：${char.handoverNote}` : '\n交接备注：（空）');
    return updateTask(existing.id, {
      story: char.story,
      description,
      severity: handoverSeverityOf(char),
    });
  }

  // ==================== 排练计划（sourceType='rehearsal'） ====================

  // 某角色在某计划下的排练来源任务
  function getRehearsalTasksByCharacterId(planId: string, characterId: string): InspectionTask[] {
    return tasks.value.filter(
      t => t.sourceType === 'rehearsal' && t.planId === planId && t.characterId === characterId
    );
  }

  // 找到某计划下某角色尚未解决的排练任务（用于只补缺、不覆盖）
  function findActiveRehearsalTask(planId: string, characterId: string): InspectionTask | undefined {
    return tasks.value.find(
      t =>
        t.sourceType === 'rehearsal' &&
        t.planId === planId &&
        t.characterId === characterId &&
        UNRESOLVED_STATUSES.includes(t.status)
    );
  }

  // 排练结果转任务闭环：
  // - fail → 高严重度任务；need_rehearse → 中严重度任务；其它结果不创建
  // - sourceType='rehearsal'，sourceId=planId，planId 与 characterId 都写入
  // - 严格遵循中段约束：只补缺，不覆盖用户已编辑的 status/assignee/dueAt/description
  function syncTaskFromRehearsalResult(params: {
    planId: string;
    story: string;
    char: Character;
    result: RehearsalResult;
    rehearsalNote?: string;
    defaultAssignee?: string;
  }): InspectionTask | null {
    const { planId, story, char, result, rehearsalNote, defaultAssignee } = params;
    if (result !== 'fail' && result !== 'need_rehearse') return null;

    const severity: InspectionSeverity = result === 'fail' ? 'high' : 'medium';
    const title =
      result === 'fail'
        ? buildRehearsalFailTitle(char.name)
        : buildRehearsalNeedRehearseTitle(char.name);
    const resultLabel = result === 'fail' ? '排练未通过' : '需复排';
    const description =
      `排练结果为「${resultLabel}」，需安排复排处理。` +
      (rehearsalNote ? `\n排练备注：${rehearsalNote}` : '');

    const existing = findActiveRehearsalTask(planId, char.id);
    if (existing) {
      // 已存在未解决的排练任务：只补缺，不覆盖用户已编辑的 status/assignee/dueAt/description
      const updates: Partial<InspectionTask> = { story, title, severity };
      if (!existing.description) updates.description = description;
      if (!existing.assignee && (char.owner || defaultAssignee)) {
        updates.assignee = char.owner || defaultAssignee || '';
      }
      return updateTask(existing.id, updates);
    }

    return addTask({
      sourceType: 'rehearsal',
      sourceId: planId,
      story,
      characterId: char.id,
      planId,
      title,
      description,
      severity,
      status: 'open',
      assignee: char.owner || defaultAssignee || '',
    });
  }


  // 角色被删除时：关联任务不能丢失，进入 blocked 并保留来源信息
  function blockTasksByCharacterDeletion(characterId: string, characterName = ''): number {
    let count = 0;
    tasks.value.forEach((task) => {
      if (task.characterId === characterId && task.status !== 'resolved' && task.status !== 'blocked') {
        const suffix = `【${characterName || '关联角色'}已从角色清单删除，任务因来源缺失被阻塞，来源信息已保留】`;
        updateTask(task.id, {
          status: 'blocked',
          description: task.description ? `${task.description}\n${suffix}` : suffix,
        });
        count++;
      }
    });
    return count;
  }

  // 排练计划清理无效角色时：关联任务进入 blocked 并保留来源信息
  function blockTasksByPlanCleanup(planId: string, characterId: string, characterName = ''): number {
    let count = 0;
    tasks.value.forEach((task) => {
      if (
        task.planId === planId &&
        task.characterId === characterId &&
        task.status !== 'resolved' &&
        task.status !== 'blocked'
      ) {
        const who = characterName ? `${characterName}：` : '';
        const suffix = `【${who}角色已从排练计划移除，任务因来源缺失被阻塞，来源信息已保留】`;
        updateTask(task.id, {
          status: 'blocked',
          description: task.description ? `${task.description}\n${suffix}` : suffix,
        });
        count++;
      }
    });
    return count;
  }

  // 从原始数组恢复巡检任务：逐条 normalize（严格使用 InspectionTask camelCase schema），重建重复 id
  function restoreTasks(
    rawList: any[]
  ): { count: number; invalidCount: number; reissued: number } {
    const normalized: InspectionTask[] = [];
    let invalidCount = 0;
    (Array.isArray(rawList) ? rawList : []).forEach((item) => {
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
    const { items, reissued } = reissueDuplicateIds(normalized, generateId);
    tasks.value = items;
    return { count: items.length, invalidCount, reissued };
  }

  // 恢复后一致性校验：characterId / planId 找不到关联对象的未解决任务标记为 blocked，
  // 仍保留 sourceType / sourceId / story。返回被标记的数量。
  function validateTaskConsistency(
    validCharacterIds: Set<string>,
    validPlanIds: Set<string>
  ): number {
    let blockedCount = 0;
    tasks.value.forEach((task) => {
      if (task.status === 'blocked' || task.status === 'resolved' || task.status === 'dismissed') {
        return;
      }
      const missingChar = !!task.characterId && !validCharacterIds.has(task.characterId);
      const missingPlan = !!task.planId && !validPlanIds.has(task.planId);
      if (missingChar || missingPlan) {
        const reasons: string[] = [];
        if (missingChar) reasons.push(`characterId「${task.characterId}」不存在`);
        if (missingPlan) reasons.push(`planId「${task.planId}」不存在`);
        const suffix = `【备份恢复一致性校验：${reasons.join('，')}，任务被阻塞，来源信息已保留】`;
        updateTask(task.id, {
          status: 'blocked',
          description: task.description ? `${task.description}\n${suffix}` : suffix,
        });
        blockedCount++;
      }
    });
    return blockedCount;
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
    // 单角色自动补齐 + 未解决任务查询
    createAutoTasksForCharacter,
    getUnresolvedTasksByCharacterId,
    getMissingPartTasksForCharacter,
    // 交接核对（handover）
    getHandoverTasksByCharacterId,
    upsertHandoverBlockTask,
    syncHandoverNoteToTask,
    // 排练计划（rehearsal）
    getRehearsalTasksByCharacterId,
    syncTaskFromRehearsalResult,
    // 备份恢复
    restoreTasks,
    validateTaskConsistency,
    // 附加：来源缺失时的阻塞处理
    blockTasksByCharacterDeletion,
    blockTasksByPlanCleanup,
  };
}
