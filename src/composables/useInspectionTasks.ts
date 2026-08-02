import { ref, computed, watch } from 'vue';
import type {
  InspectionTask,
  TaskSourceType,
  TaskSeverity,
  TaskStatus,
  Character,
  RehearsalPlan,
} from '../types';
import { normalizeInspectionTask } from '../types';
import { mockInspectionTasks } from '../data/mockData';

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
  return mockInspectionTasks.map(t => normalizeInspectionTask(t));
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

function makeTaskKey(task: Pick<InspectionTask, 'sourceType' | 'sourceId' | 'characterId' | 'planId' | 'title'>): string {
  return [task.sourceType, task.sourceId, task.characterId ?? '', task.planId ?? '', task.title].join('::');
}

export function buildMissingAccessoryTitle(characterName: string, accessoryName: string): string {
  return `补齐${characterName}的${accessoryName}`;
}

export function buildRiskReviewTitle(characterName: string): string {
  return `复核${characterName}风险说明`;
}

export function buildAssignOwnerTitle(characterName: string): string {
  return `分配${characterName}责任人`;
}

export function buildHandoverRiskTitle(characterName: string): string {
  return `跟进${characterName}交接风险`;
}

export function buildRehearsalResultTitle(planName: string, characterName: string): string {
  return `排练跟进：${planName} - ${characterName}`;
}

export function buildRehearsalProblemTitle(planName: string): string {
  return `处理排练问题：${planName}`;
}

export function isTaskUnresolved(task: InspectionTask): boolean {
  return task.status !== 'resolved' && task.status !== 'dismissed';
}

export function useInspectionTasks() {
  function addTask(data: Omit<InspectionTask, 'id' | 'createdAt' | 'updatedAt'>): InspectionTask {
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
    const current = tasks.value[index];
    const merged: any = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    if (updates.status === 'resolved' && !current.resolvedAt && !updates.resolvedAt) {
      merged.resolvedAt = new Date().toISOString();
    }
    if (updates.status && updates.status !== 'resolved') {
      merged.resolvedAt = '';
    }
    tasks.value[index] = normalizeInspectionTask(merged);
    return tasks.value[index];
  }

  function deleteTask(id: string): boolean {
    const index = tasks.value.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks.value.splice(index, 1);
      return true;
    }
    return false;
  }

  function resolveTask(id: string): InspectionTask | null {
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

  function blockTasksForMissingCharacter(characterId: string, characterName: string) {
    tasks.value.forEach((task, idx) => {
      if (task.characterId === characterId && task.status !== 'resolved' && task.status !== 'dismissed' && task.status !== 'blocked') {
        tasks.value[idx] = normalizeInspectionTask({
          ...task,
          status: 'blocked',
          description: task.description + `\n[关联角色「${characterName}」已删除，任务已自动阻塞]`,
          updatedAt: new Date().toISOString(),
        });
      }
    });
  }

  function syncTasksFromCharacters(
    characters: Character[],
    plans: RehearsalPlan[] = []
  ): { added: number; blocked: number } {
    const existingKeys = new Set(
      tasks.value.map(t => makeTaskKey(t))
    );

    const now = new Date().toISOString();
    const newTasks: InspectionTask[] = [];
    let blockedCount = 0;

    const validCharacterIds = new Set(characters.map(c => c.id));

    tasks.value.forEach((task, idx) => {
      if (task.characterId && !validCharacterIds.has(task.characterId)) {
        if (task.status !== 'resolved' && task.status !== 'dismissed' && task.status !== 'blocked') {
          tasks.value[idx] = normalizeInspectionTask({
            ...task,
            status: 'blocked',
            updatedAt: now,
          });
          blockedCount++;
        }
      }
    });

    characters.forEach((character) => {
      const baseInfo = {
        story: character.story,
        characterId: character.id,
        planId: null as string | null,
        assignee: character.owner || '',
        dueAt: '',
        resolvedAt: '',
      };

      character.missingAccessories.forEach((gap) => {
        if (gap.available < gap.required) {
          const title = buildMissingAccessoryTitle(character.name, gap.name);
          const key = makeTaskKey({
            sourceType: 'character',
            sourceId: character.id,
            characterId: character.id,
            planId: null,
            title,
          });
          if (!existingKeys.has(key)) {
            newTasks.push(normalizeInspectionTask({
              ...baseInfo,
              sourceType: 'character',
              sourceId: character.id,
              title,
              description: `角色「${character.name}」缺少配件「${gap.name}」：需要 ${gap.required} 件，现有 ${gap.available} 件，缺 ${gap.required - gap.available} 件。`,
              severity: character.riskLevel === 'critical' ? 'critical' : character.riskLevel === 'high' ? 'high' : 'medium',
              status: 'open',
              createdAt: now,
              updatedAt: now,
            }));
            existingKeys.add(key);
          }
        }
      });

      if ((character.riskLevel === 'high' || character.riskLevel === 'critical') && character.riskNote) {
        const title = buildRiskReviewTitle(character.name);
        const key = makeTaskKey({
          sourceType: 'character',
          sourceId: character.id,
          characterId: character.id,
          planId: null,
          title,
        });
        if (!existingKeys.has(key)) {
          newTasks.push(normalizeInspectionTask({
            ...baseInfo,
            sourceType: 'character',
            sourceId: character.id,
            title,
            description: `角色「${character.name}」风险等级为${character.riskLevel === 'critical' ? '严重' : '高'}：${character.riskNote}${character.repairNote ? `。修复建议：${character.repairNote}` : ''}`,
            severity: character.riskLevel,
            status: 'open',
            createdAt: now,
            updatedAt: now,
          }));
          existingKeys.add(key);
        }
      }

      if (!character.owner) {
        const title = buildAssignOwnerTitle(character.name);
        const key = makeTaskKey({
          sourceType: 'character',
          sourceId: character.id,
          characterId: character.id,
          planId: null,
          title,
        });
        if (!existingKeys.has(key)) {
          newTasks.push(normalizeInspectionTask({
            ...baseInfo,
            sourceType: 'character',
            sourceId: character.id,
            title,
            description: `角色「${character.name}」尚未分配责任人，请尽快指定负责人。`,
            severity: 'medium',
            status: 'open',
            createdAt: now,
            updatedAt: now,
          }));
          existingKeys.add(key);
        }
      }

      if (character.handoverStatus === 'has_risk' && character.handoverNote) {
        const title = buildHandoverRiskTitle(character.name);
        const key = makeTaskKey({
          sourceType: 'handover',
          sourceId: character.id,
          characterId: character.id,
          planId: null,
          title,
        });
        if (!existingKeys.has(key)) {
          newTasks.push(normalizeInspectionTask({
            ...baseInfo,
            sourceType: 'handover',
            sourceId: character.id,
            title,
            description: `交接核对发现角色「${character.name}」存在风险：${character.handoverNote}`,
            severity: character.riskLevel === 'critical' ? 'critical' : 'high',
            status: 'open',
            createdAt: now,
            updatedAt: now,
          }));
          existingKeys.add(key);
        }
      }
    });

    plans.forEach((plan) => {
      plan.characters.forEach((rc) => {
        if (rc.rehearsalResult === 'fail' || rc.rehearsalResult === 'need_rehearse') {
          const character = characters.find(c => c.id === rc.characterId);
          const charName = character?.name ?? rc.characterId;
          const title = `排练跟进：${plan.name} - ${charName}`;
          const key = makeTaskKey({
            sourceType: 'rehearsal',
            sourceId: plan.id + '_' + rc.characterId,
            characterId: rc.characterId,
            planId: plan.id,
            title,
          });
          if (!existingKeys.has(key)) {
            newTasks.push(normalizeInspectionTask({
              sourceType: 'rehearsal',
              sourceId: plan.id + '_' + rc.characterId,
              story: plan.story,
              characterId: rc.characterId,
              planId: plan.id,
              title,
              description: `排练场次「${plan.name}」中角色「${charName}」排练结果为${rc.rehearsalResult === 'fail' ? '未通过' : '需复排'}${rc.rehearsalNote ? '：' + rc.rehearsalNote : ''}`,
              severity: rc.rehearsalResult === 'fail' ? 'high' : 'medium',
              status: 'open',
              assignee: plan.owner || character?.owner || rc.checkedBy || '',
              dueAt: plan.scheduledAt || '',
              resolvedAt: '',
              createdAt: now,
              updatedAt: now,
            }));
            existingKeys.add(key);
          }
        }
      });

      if (plan.problemNotes) {
        const title = `处理排练问题：${plan.name}`;
        const key = makeTaskKey({
          sourceType: 'rehearsal',
          sourceId: plan.id + '_notes',
          characterId: null,
          planId: plan.id,
          title,
        });
        if (!existingKeys.has(key)) {
          newTasks.push(normalizeInspectionTask({
            sourceType: 'rehearsal',
            sourceId: plan.id + '_notes',
            story: plan.story,
            characterId: null,
            planId: plan.id,
            title,
            description: `排练场次「${plan.name}」记录的问题：${plan.problemNotes}`,
            severity: 'medium',
            status: 'open',
            assignee: plan.owner || '',
            dueAt: plan.scheduledAt || '',
            resolvedAt: '',
            createdAt: now,
            updatedAt: now,
          }));
          existingKeys.add(key);
        }
      }
    });

    if (newTasks.length > 0) {
      tasks.value.push(...newTasks);
    }

    return { added: newTasks.length, blocked: blockedCount };
  }

  const allStories = computed(() => {
    const set = new Set(tasks.value.map(t => t.story).filter(Boolean));
    return Array.from(set).sort();
  });

  const allAssignees = computed(() => {
    const set = new Set(tasks.value.map(t => t.assignee).filter(Boolean));
    return Array.from(set).sort();
  });

  const stats = computed(() => {
    const total = tasks.value.length;
    const open = tasks.value.filter(t => t.status === 'open').length;
    const inProgress = tasks.value.filter(t => t.status === 'in_progress').length;
    const blocked = tasks.value.filter(t => t.status === 'blocked').length;
    const resolved = tasks.value.filter(t => t.status === 'resolved').length;
    const dismissed = tasks.value.filter(t => t.status === 'dismissed').length;
    const critical = tasks.value.filter(t => t.severity === 'critical' && t.status !== 'resolved' && t.status !== 'dismissed').length;
    const high = tasks.value.filter(t => t.severity === 'high' && t.status !== 'resolved' && t.status !== 'dismissed').length;
    return { total, open, inProgress, blocked, resolved, dismissed, critical, high };
  });

  function getUnresolvedTasksByCharacterId(characterId: string): InspectionTask[] {
    return tasks.value.filter(t => t.characterId === characterId && isTaskUnresolved(t));
  }

  function getUnresolvedTaskCountByCharacterId(characterId: string): number {
    return tasks.value.filter(t => t.characterId === characterId && isTaskUnresolved(t)).length;
  }

  function getStoryActiveTaskStats(story: string) {
    const list = tasks.value.filter(t => t.story === story && isTaskUnresolved(t));
    return {
      total: list.length,
      open: list.filter(t => t.status === 'open').length,
      inProgress: list.filter(t => t.status === 'in_progress').length,
      blocked: list.filter(t => t.status === 'blocked').length,
      critical: list.filter(t => t.severity === 'critical').length,
      high: list.filter(t => t.severity === 'high').length,
    };
  }

  function suggestResolveMissingPartTasks(character: Character): InspectionTask[] {
    const resolved: InspectionTask[] = [];
    const missingNames = new Set(
      character.missingAccessories
        .filter(g => g.available < g.required)
        .map(g => g.name)
    );

    tasks.value.forEach((task, idx) => {
      if (
        task.characterId === character.id &&
        task.sourceType === 'character' &&
        task.sourceId === character.id &&
        isTaskUnresolved(task)
      ) {
        const isMissingPartTask =
          task.title.startsWith('补齐') &&
          task.title.endsWith('的') === false &&
          task.title.includes(character.name);
        if (!isMissingPartTask) return;

        const accessoryName = task.title.slice(
          ('补齐' + character.name + '的').length
        );
        if (!missingNames.has(accessoryName)) {
          tasks.value[idx] = normalizeInspectionTask({
            ...task,
            status: 'resolved',
            resolvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          resolved.push(tasks.value[idx]);
        }
      }
    });

    return resolved;
  }

  function createManualTaskForCharacter(character: Character, data: {
    title: string;
    description?: string;
    severity?: TaskSeverity;
    assignee?: string;
    dueAt?: string;
  }): InspectionTask {
    return addTask({
      sourceType: 'manual',
      sourceId: 'manual_char_' + character.id + '_' + Date.now(),
      story: character.story,
      characterId: character.id,
      planId: null,
      title: data.title,
      description: data.description || '',
      severity: data.severity || 'medium',
      status: 'open',
      assignee: data.assignee || character.owner || '',
      dueAt: data.dueAt || '',
      resolvedAt: '',
    });
  }

  function findHandoverTaskForCharacter(characterId: string): InspectionTask | undefined {
    return tasks.value.find(
      t => t.sourceType === 'handover' && t.sourceId === characterId && t.characterId === characterId
    );
  }

  function buildHandoverRiskReasons(character: Character): string[] {
    const reasons: string[] = [];
    const missing = character.missingAccessories.filter(a => a.available < a.required);
    if (missing.length > 0) {
      reasons.push(`缺件：${missing.map(a => `${a.name}缺${a.required - a.available}`).join('，')}`);
    }
    if (character.riskLevel === 'high' || character.riskLevel === 'critical') {
      const riskLabel = character.riskLevel === 'critical' ? '严重' : '高';
      reasons.push(`高风险（${riskLabel}）${character.riskNote ? '：' + character.riskNote : ''}`);
    }
    if (!character.owner) {
      reasons.push('未分配责任人');
    }
    return reasons;
  }

  function upsertHandoverTaskForCharacter(
    character: Character,
    options?: { handoverNote?: string; attemptedConfirm?: boolean }
  ): { task: InspectionTask; created: boolean } {
    const title = buildHandoverRiskTitle(character.name);
    const existing = findHandoverTaskForCharacter(character.id);
    const reasons = buildHandoverRiskReasons(character);
    const note = options?.handoverNote ?? character.handoverNote ?? '';

    const reasonText = reasons.length > 0 ? reasons.join('；') : '交接核对发现风险';
    const baseDescription = note
      ? `交接核对发现角色「${character.name}」存在风险：${reasonText}。\n交接备注：${note}`
      : `交接核对发现角色「${character.name}」存在风险：${reasonText}。`;
    const description = options?.attemptedConfirm
      ? `${baseDescription}\n[用户曾尝试将该角色标记为「可交接」，但因客观风险被拦截]`
      : baseDescription;

    const severity: TaskSeverity =
      character.riskLevel === 'critical' ? 'critical' :
      character.riskLevel === 'high' ? 'high' :
      character.missingAccessories.some(a => a.available < a.required) ? 'high' : 'medium';

    if (existing) {
      const preservedStatus: TaskStatus =
        existing.status === 'resolved' || existing.status === 'dismissed'
          ? 'open'
          : existing.status;

      const nextAssignee = existing.assignee || character.owner || '';
      const nextDescription = existing.description && existing.description !== description
        ? existing.description
        : description;

      const updated = normalizeInspectionTask({
        ...existing,
        title,
        description: nextDescription,
        severity,
        status: preservedStatus,
        assignee: nextAssignee,
        story: character.story,
        planId: null,
        updatedAt: new Date().toISOString(),
      });
      const idx = tasks.value.findIndex(t => t.id === existing.id);
      if (idx !== -1) {
        tasks.value[idx] = updated;
      }
      return { task: updated, created: false };
    }

    const task = addTask({
      sourceType: 'handover',
      sourceId: character.id,
      story: character.story,
      characterId: character.id,
      planId: null,
      title,
      description,
      severity,
      status: 'open',
      assignee: character.owner || '',
      dueAt: '',
      resolvedAt: '',
    });
    return { task, created: true };
  }

  function ensureAssignOwnerTaskForCharacter(character: Character): { task: InspectionTask; created: boolean } | null {
    if (character.owner) return null;
    const title = buildAssignOwnerTitle(character.name);
    const existing = tasks.value.find(
      t => t.sourceType === 'character' && t.sourceId === character.id &&
        t.characterId === character.id && t.title === title
    );
    if (existing) {
      return { task: existing, created: false };
    }
    const task = addTask({
      sourceType: 'character',
      sourceId: character.id,
      story: character.story,
      characterId: character.id,
      planId: null,
      title,
      description: `角色「${character.name}」尚未分配责任人，请尽快指定负责人。`,
      severity: 'medium',
      status: 'open',
      assignee: '',
      dueAt: '',
      resolvedAt: '',
    });
    return { task, created: true };
  }

  function syncHandoverNoteToTask(characterId: string, note: string): InspectionTask | null {
    const existing = tasks.value.find(
      t => t.sourceType === 'handover' && t.sourceId === characterId && t.characterId === characterId
    );
    if (!existing) return null;
    if (existing.description && existing.description.includes('交接备注：')) {
      const updated = normalizeInspectionTask({
        ...existing,
        description: existing.description.replace(/交接备注：[^\n]*/, `交接备注：${note || '（无）'}`),
        updatedAt: new Date().toISOString(),
      });
      const idx = tasks.value.findIndex(t => t.id === existing.id);
      if (idx !== -1) tasks.value[idx] = updated;
      return updated;
    }
    return existing;
  }

  function findRehearsalResultTask(planId: string, characterId: string): InspectionTask | undefined {
    const titlePrefix = '排练跟进：';
    return tasks.value.find(
      t => t.sourceType === 'rehearsal'
        && t.sourceId === planId
        && t.planId === planId
        && t.characterId === characterId
        && t.title.startsWith(titlePrefix)
    );
  }

  function upsertRehearsalResultTask(
    plan: { id: string; name: string; story: string; owner: string; scheduledAt: string },
    character: { id: string; name: string; owner: string },
    result: 'fail' | 'need_rehearse',
    rehearsalNote: string,
    checkedBy: string
  ): { task: InspectionTask; created: boolean } {
    const title = buildRehearsalResultTitle(plan.name, character.name);
    const existing = findRehearsalResultTask(plan.id, character.id);
    const severity: TaskSeverity = result === 'fail' ? 'high' : 'medium';
    const resultLabel = result === 'fail' ? '未通过' : '需复排';
    const description =
      `排练场次「${plan.name}」中角色「${character.name}」排练结果为${resultLabel}` +
      (rehearsalNote ? '：' + rehearsalNote : '。');

    if (existing) {
      const preservedStatus: TaskStatus =
        existing.status === 'dismissed' ? 'open' : existing.status;

      const updated = normalizeInspectionTask({
        ...existing,
        title,
        description,
        severity,
        status: preservedStatus,
        story: plan.story,
        planId: plan.id,
        characterId: character.id,
        sourceId: plan.id,
        sourceType: 'rehearsal',
        assignee: existing.assignee || plan.owner || character.owner || checkedBy || '',
        dueAt: existing.dueAt || plan.scheduledAt || '',
        updatedAt: new Date().toISOString(),
      });
      const idx = tasks.value.findIndex(t => t.id === existing.id);
      if (idx !== -1) tasks.value[idx] = updated;
      return { task: updated, created: false };
    }

    const task = addTask({
      sourceType: 'rehearsal',
      sourceId: plan.id,
      story: plan.story,
      characterId: character.id,
      planId: plan.id,
      title,
      description,
      severity,
      status: 'open',
      assignee: plan.owner || character.owner || checkedBy || '',
      dueAt: plan.scheduledAt || '',
      resolvedAt: '',
    });
    return { task, created: true };
  }

  function resolveRehearsalResultTaskIfAuto(
    planId: string,
    characterId: string
  ): InspectionTask | null {
    const existing = findRehearsalResultTask(planId, characterId);
    if (!existing) return null;
    if (existing.sourceType !== 'rehearsal') return null;
    if (existing.status === 'resolved') return existing;
    const updated = normalizeInspectionTask({
      ...existing,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const idx = tasks.value.findIndex(t => t.id === existing.id);
    if (idx !== -1) tasks.value[idx] = updated;
    return updated;
  }

  function blockTasksForRemovedPlanCharacter(
    planId: string,
    characterId: string,
    characterName?: string
  ): number {
    let count = 0;
    tasks.value.forEach((task, idx) => {
      if (
        task.planId === planId
        && task.characterId === characterId
        && task.status !== 'resolved'
        && task.status !== 'dismissed'
        && task.status !== 'blocked'
      ) {
        const label = characterName ? `「${characterName}」` : '';
        tasks.value[idx] = normalizeInspectionTask({
          ...task,
          status: 'blocked',
          description:
            task.description
            + (task.description.endsWith('\n') ? '' : '\n')
            + `[角色${label}已从排练计划移除]`,
          updatedAt: new Date().toISOString(),
        });
        count++;
      }
    });
    return count;
  }

  function getPlanTaskStats(planId: string) {
    const list = tasks.value.filter(t => t.planId === planId);
    const active = list.filter(isTaskUnresolved);
    const order: TaskSeverity[] = ['low', 'medium', 'high', 'critical'];
    let highest: TaskSeverity = 'low';
    active.forEach(t => {
      if (order.indexOf(t.severity) > order.indexOf(highest)) highest = t.severity;
    });
    return {
      total: list.length,
      unresolved: active.length,
      open: active.filter(t => t.status === 'open').length,
      inProgress: active.filter(t => t.status === 'in_progress').length,
      blocked: active.filter(t => t.status === 'blocked').length,
      resolved: list.filter(t => t.status === 'resolved').length,
      dismissed: list.filter(t => t.status === 'dismissed').length,
      highestSeverity: active.length > 0 ? highest : null as TaskSeverity | null,
    };
  }

  function getUnresolvedTasksByPlanId(planId: string): InspectionTask[] {
    return tasks.value.filter(t => t.planId === planId && isTaskUnresolved(t));
  }

  function getUnresolvedTaskCountByPlanId(planId: string): number {
    return tasks.value.filter(t => t.planId === planId && isTaskUnresolved(t)).length;
  }

  function exportData(): string {
    return JSON.stringify(tasks.value, null, 2);
  }

  function importData(
    json: string,
    context?: { validCharacterIds?: Set<string>; validPlanIds?: Set<string> }
  ): {
    success: boolean;
    count: number;
    invalidCount: number;
    duplicateCount: number;
    blockedCount: number;
  } {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        return { success: false, count: 0, invalidCount: 0, duplicateCount: 0, blockedCount: 0 };
      }

      const existingIds = new Set(tasks.value.map(t => t.id));
      const normalized: InspectionTask[] = [];
      let invalidCount = 0;
      let duplicateCount = 0;
      let blockedCount = 0;
      const now = new Date().toISOString();

      parsed.forEach((item) => {
        if (!item || typeof item !== 'object') {
          invalidCount++;
          return;
        }
        try {
          let task = normalizeInspectionTask(item);

          if (existingIds.has(task.id)) {
            task = normalizeInspectionTask({
              ...task,
              id: 'task_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            });
            duplicateCount++;
          }

          const validCharacterIds = context?.validCharacterIds;
          const validPlanIds = context?.validPlanIds;
          let needsBlock = false;
          if (task.characterId && validCharacterIds && !validCharacterIds.has(task.characterId)) {
            needsBlock = true;
          }
          if (task.planId && validPlanIds && !validPlanIds.has(task.planId)) {
            needsBlock = true;
          }
          if (needsBlock && task.status !== 'resolved' && task.status !== 'dismissed') {
            const note = '[备份恢复时检测到关联的角色或排练计划不存在，任务已自动阻塞]';
            task = normalizeInspectionTask({
              ...task,
              status: 'blocked',
              description: task.description ? `${task.description}\n${note}` : note,
              updatedAt: now,
            });
            blockedCount++;
          }

          existingIds.add(task.id);
          normalized.push(task);
        } catch {
          invalidCount++;
        }
      });

      tasks.value = normalized;
      return { success: true, count: normalized.length, invalidCount, duplicateCount, blockedCount };
    } catch {
      return { success: false, count: 0, invalidCount: 0, duplicateCount: 0, blockedCount: 0 };
    }
  }

  function reconcileWithReferences(validCharacterIds: Set<string>, validPlanIds: Set<string>): number {
    let blockedCount = 0;
    const now = new Date().toISOString();
    tasks.value.forEach((task, idx) => {
      let needsBlock = false;
      if (task.characterId && !validCharacterIds.has(task.characterId)) needsBlock = true;
      if (task.planId && !validPlanIds.has(task.planId)) needsBlock = true;
      if (needsBlock && task.status !== 'resolved' && task.status !== 'dismissed' && task.status !== 'blocked') {
        const note = '[关联的角色或排练计划不存在，任务已自动阻塞]';
        tasks.value[idx] = normalizeInspectionTask({
          ...task,
          status: 'blocked',
          description: task.description ? `${task.description}\n${note}` : note,
          updatedAt: now,
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
    getUnresolvedTasksByCharacterId,
    getUnresolvedTaskCountByCharacterId,
    getUnresolvedTasksByPlanId,
    getUnresolvedTaskCountByPlanId,
    getStoryActiveTaskStats,
    getPlanTaskStats,
    suggestResolveMissingPartTasks,
    createManualTaskForCharacter,
    findHandoverTaskForCharacter,
    upsertHandoverTaskForCharacter,
    ensureAssignOwnerTaskForCharacter,
    syncHandoverNoteToTask,
    findRehearsalResultTask,
    upsertRehearsalResultTask,
    resolveRehearsalResultTaskIfAuto,
    blockTasksForRemovedPlanCharacter,
    syncTasksFromCharacters,
    blockTasksForMissingCharacter,
    allStories,
    allAssignees,
    stats,
    exportData,
    importData,
    reconcileWithReferences,
  };
}
