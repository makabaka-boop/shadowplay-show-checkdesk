import { ref, computed, watch } from 'vue';
import type {
  InspectionTask,
  InspectionSourceType,
  InspectionSeverity,
  InspectionTaskStatus,
  Character,
} from '../types';
import { normalizeInspectionTask } from '../types';
import { mockInspectionTasks } from '../data/mockData';
import { useCharacters } from './useCharacters';

const STORAGE_KEY = 'shadow-puppetry-inspection-tasks';

function migrateHandoverSourceId(raw: any): any {
  if (
    raw &&
    raw.sourceType === 'handover' &&
    typeof raw.sourceId === 'string' &&
    raw.sourceId.endsWith(':handover')
  ) {
    return { ...raw, sourceId: raw.sourceId.slice(0, -':handover'.length) };
  }
  return raw;
}

function migrateRehearsalSourceId(raw: any): any {
  if (
    raw &&
    raw.sourceType === 'rehearsal' &&
    typeof raw.sourceId === 'string'
  ) {
    const oldPerCharMatch = raw.sourceId.match(/^(.+):[^:]+:rehearsal$/);
    if (oldPerCharMatch) {
      return { ...raw, sourceId: oldPerCharMatch[1] };
    }
  }
  return raw;
}

function migrateTask(raw: any): any {
  return migrateRehearsalSourceId(migrateHandoverSourceId(raw));
}

function loadFromStorage(): InspectionTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => normalizeInspectionTask(migrateTask(item)));
      }
    }
  } catch {
    console.warn('Failed to load inspection tasks from storage');
  }
  return mockInspectionTasks.map(t => normalizeInspectionTask(migrateTask(t)));
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

function _addTaskInternal(data: Omit<InspectionTask, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}): InspectionTask {
  const now = new Date().toISOString();
  const newTask = normalizeInspectionTask({
    ...data,
    id: data.id || generateId(),
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
  });
  tasks.value.push(newTask);
  return newTask;
}

function _updateTaskInternal(id: string, updates: Partial<InspectionTask>): InspectionTask | null {
  const index = tasks.value.findIndex(t => t.id === id);
  if (index === -1) return null;
  tasks.value[index] = normalizeInspectionTask({
    ...tasks.value[index],
    ...updates,
    id: tasks.value[index].id,
    updatedAt: new Date().toISOString(),
  });
  return tasks.value[index];
}

function _findExistingTask(sourceType: InspectionSourceType, sourceId: string): InspectionTask | undefined {
  return tasks.value.find(t => t.sourceType === sourceType && t.sourceId === sourceId);
}

function _buildMissingAccessorySourceId(charId: string, accessoryName: string): string {
  return `${charId}:missing:${accessoryName}`;
}
function _buildRiskSourceId(charId: string): string { return `${charId}:risk`; }
function _buildNoOwnerSourceId(charId: string): string { return `${charId}:no-owner`; }
function _buildHandoverSourceId(charId: string): string { return charId; }

function _charHasObjectiveRisk(char: Character): boolean {
  const hasMissingParts = char.missingAccessories.some(a => a.available < a.required);
  const isHighRisk = char.riskLevel === 'high' || char.riskLevel === 'critical';
  const noOwner = !char.owner.trim();
  return hasMissingParts || isHighRisk || noOwner;
}

function _buildHandoverTaskDescription(char: Character, handoverNote?: string): string {
  const descParts: string[] = [];
  const note = handoverNote ?? char.handoverNote;
  if (note && note.trim()) descParts.push(note.trim());
  const gaps = char.missingAccessories
    .filter(a => a.available < a.required)
    .map(a => `${a.name}缺${a.required - a.available}`);
  if (gaps.length > 0) descParts.push(`缺件：${gaps.join('，')}`);
  if ((char.riskLevel === 'high' || char.riskLevel === 'critical') && char.riskNote) {
    descParts.push(`风险：${char.riskNote}`);
  }
  if (!char.owner.trim()) descParts.push('未分配责任人');
  return descParts.join('；') || '交接核对中标记存在客观风险，请确认处理。';
}

function _severityFromRiskLevel(level: string): InspectionSeverity {
  if (level === 'critical') return 'critical';
  if (level === 'high') return 'high';
  if (level === 'medium') return 'medium';
  return 'low';
}

function _syncFromCharacters(chars: Character[]): { created: number; unblocked: number; blocked: number } {
  let created = 0;
  let unblocked = 0;

  for (const char of chars) {
    for (const accessory of char.missingAccessories) {
      if (accessory.available >= accessory.required) continue;
      const sourceId = _buildMissingAccessorySourceId(char.id, accessory.name);
      const existing = _findExistingTask('character', sourceId);
      if (!existing) {
        const gap = accessory.required - accessory.available;
        _addTaskInternal({
          sourceType: 'character',
          sourceId,
          story: char.story,
          characterId: char.id,
          planId: '',
          title: `补齐${char.name}的${accessory.name}`,
          description: `${char.name}角色缺少${accessory.name}配件（需${accessory.required}个，现有${accessory.available}个，缺${gap}个）。`,
          severity: char.riskLevel === 'critical' || char.riskLevel === 'high' ? 'high' : 'medium',
          status: 'open',
          assignee: char.owner || '',
          dueAt: '',
          resolvedAt: '',
        });
        created++;
      } else if (existing.status === 'blocked') {
        _updateTaskInternal(existing.id, { status: 'open' });
        unblocked++;
      }
    }

    if ((char.riskLevel === 'high' || char.riskLevel === 'critical') && char.riskNote.trim()) {
      const sourceId = _buildRiskSourceId(char.id);
      const existing = _findExistingTask('character', sourceId);
      if (!existing) {
        _addTaskInternal({
          sourceType: 'character',
          sourceId,
          story: char.story,
          characterId: char.id,
          planId: '',
          title: `复核${char.name}风险说明`,
          description: `${char.name}风险等级为${char.riskLevel === 'critical' ? '极高' : '高'}风险：${char.riskNote}`,
          severity: _severityFromRiskLevel(char.riskLevel),
          status: 'open',
          assignee: char.owner || '',
          dueAt: '',
          resolvedAt: '',
        });
        created++;
      } else if (existing.status === 'blocked') {
        _updateTaskInternal(existing.id, { status: 'open' });
        unblocked++;
      }
    }

    if (!char.owner.trim()) {
      const sourceId = _buildNoOwnerSourceId(char.id);
      const existing = _findExistingTask('character', sourceId);
      if (!existing) {
        _addTaskInternal({
          sourceType: 'character',
          sourceId,
          story: char.story,
          characterId: char.id,
          planId: '',
          title: `分配${char.name}责任人`,
          description: `${char.name}角色尚未指定责任人，请尽快安排。`,
          severity: 'medium',
          status: 'open',
          assignee: '',
          dueAt: '',
          resolvedAt: '',
        });
        created++;
      } else if (existing.status === 'blocked') {
        _updateTaskInternal(existing.id, { status: 'open' });
        unblocked++;
      }
    }

    const hasObjectiveRisk = _charHasObjectiveRisk(char);
    const needsHandoverTask =
      hasObjectiveRisk ||
      char.handoverStatus === 'has_risk' ||
      (char.handoverStatus === 'follow_up' && char.handoverNote.trim());

    if (needsHandoverTask) {
      const sourceId = _buildHandoverSourceId(char.id);
      const existing = _findExistingTask('handover', sourceId);
      if (!existing) {
        const isRisk = hasObjectiveRisk || char.handoverStatus === 'has_risk';
        _addTaskInternal({
          sourceType: 'handover',
          sourceId,
          story: char.story,
          characterId: char.id,
          planId: '',
          title: isRisk ? `跟进${char.name}交接风险` : `确认${char.name}交接跟进项`,
          description: _buildHandoverTaskDescription(char),
          severity: isRisk ? _severityFromRiskLevel(char.riskLevel) : 'medium',
          status: 'open',
          assignee: char.owner || '',
          dueAt: '',
          resolvedAt: '',
        });
        created++;
      } else if (existing.status === 'blocked') {
        _updateTaskInternal(existing.id, { status: 'open' });
        unblocked++;
      }
    }
  }

  const validCharIds = new Set(chars.map(c => c.id));
  let blocked = 0;
  tasks.value.forEach((task, idx) => {
    if (
      task.characterId &&
      !validCharIds.has(task.characterId) &&
      task.status !== 'resolved' &&
      task.status !== 'dismissed' &&
      task.status !== 'blocked'
    ) {
      tasks.value[idx] = normalizeInspectionTask({
        ...task,
        status: 'blocked' as InspectionTaskStatus,
        updatedAt: new Date().toISOString(),
      });
      blocked++;
    }
  });

  return { created, unblocked, blocked };
}

let _autoSyncInitialized = false;
function ensureAutoSync() {
  if (_autoSyncInitialized) return;
  _autoSyncInitialized = true;
  try {
    const { characters } = useCharacters();
    watch(characters, (newChars) => {
      _syncFromCharacters(newChars);
    }, { deep: true });
    _syncFromCharacters(characters.value);
  } catch {
    // useCharacters may not be available during SSR; defer to composable call
  }
}

export function useInspectionTasks() {
  ensureAutoSync();
  const { characters } = useCharacters();

  function addTask(data: Omit<InspectionTask, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  }): InspectionTask {
    const now = new Date().toISOString();
    const newTask = normalizeInspectionTask({
      ...data,
      id: data.id || generateId(),
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
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

  function resolveTask(id: string): InspectionTask | null {
    const index = tasks.value.findIndex(t => t.id === id);
    if (index === -1) return null;
    const now = new Date().toISOString();
    tasks.value[index] = normalizeInspectionTask({
      ...tasks.value[index],
      status: 'resolved',
      resolvedAt: now,
      updatedAt: now,
    });
    return tasks.value[index];
  }

  function getTasksByCharacterId(characterId: string): InspectionTask[] {
    return tasks.value.filter(t => t.characterId === characterId);
  }

  function getUnresolvedTasksByCharacter(characterId: string): InspectionTask[] {
    return tasks.value.filter(
      t => t.characterId === characterId &&
        (t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked')
    );
  }

  function getUnresolvedTaskCountByCharacter(characterId: string): number {
    return tasks.value.filter(
      t => t.characterId === characterId &&
        (t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked')
    ).length;
  }

  function getStoryTaskStats(story: string): {
    total: number;
    open: number;
    inProgress: number;
    blocked: number;
    resolved: number;
    dismissed: number;
  } {
    const storyTasks = tasks.value.filter(t => t.story === story);
    return {
      total: storyTasks.length,
      open: storyTasks.filter(t => t.status === 'open').length,
      inProgress: storyTasks.filter(t => t.status === 'in_progress').length,
      blocked: storyTasks.filter(t => t.status === 'blocked').length,
      resolved: storyTasks.filter(t => t.status === 'resolved').length,
      dismissed: storyTasks.filter(t => t.status === 'dismissed').length,
    };
  }

  function getSuggestedResolvableTasks(characterId: string): InspectionTask[] {
    return tasks.value.filter(
      t => t.characterId === characterId &&
        t.sourceType === 'character' &&
        t.sourceId.includes(':missing:') &&
        (t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked')
    );
  }

  function createTaskForCharacter(
    characterId: string,
    data: {
      title: string;
      description?: string;
      severity?: InspectionSeverity;
      assignee?: string;
      dueAt?: string;
      sourceType?: InspectionSourceType;
      sourceId?: string;
    }
  ): InspectionTask | null {
    const char = characters.value.find(c => c.id === characterId);
    if (!char) return null;
    return addTask({
      sourceType: data.sourceType || 'manual',
      sourceId: data.sourceId || `manual:${characterId}:${Date.now()}`,
      story: char.story,
      characterId,
      planId: '',
      title: data.title,
      description: data.description || '',
      severity: data.severity || 'medium',
      status: 'open',
      assignee: data.assignee || char.owner || '',
      dueAt: data.dueAt || '',
      resolvedAt: '',
    });
  }

  function getTasksByPlanId(planId: string): InspectionTask[] {
    return tasks.value.filter(t => t.planId === planId);
  }

  function getTasksByStory(story: string): InspectionTask[] {
    return tasks.value.filter(t => t.story === story);
  }

  function findExistingTask(sourceType: InspectionSourceType, sourceId: string): InspectionTask | undefined {
    return tasks.value.find(t => t.sourceType === sourceType && t.sourceId === sourceId);
  }

  function buildMissingAccessorySourceId(charId: string, accessoryName: string): string {
    return `${charId}:missing:${accessoryName}`;
  }

  function buildRiskSourceId(charId: string): string {
    return `${charId}:risk`;
  }

  function buildNoOwnerSourceId(charId: string): string {
    return `${charId}:no-owner`;
  }

  function buildHandoverSourceId(charId: string): string {
    return charId;
  }

  function getHandoverTask(characterId: string): InspectionTask | undefined {
    return tasks.value.find(
      t => t.sourceType === 'handover' && t.sourceId === characterId
    );
  }

  function upsertHandoverTaskForCharacter(
    characterId: string,
    handoverNote?: string
  ): InspectionTask | null {
    const char = characters.value.find(c => c.id === characterId);
    if (!char) return null;

    const sourceId = _buildHandoverSourceId(characterId);
    const existing = _findExistingTask('handover', sourceId);
    const description = _buildHandoverTaskDescription(char, handoverNote);
    const hasRisk = _charHasObjectiveRisk(char);
    const title = hasRisk ? `跟进${char.name}交接风险` : `确认${char.name}交接跟进项`;
    const severity = hasRisk ? _severityFromRiskLevel(char.riskLevel) : 'medium';

    if (existing) {
      if (existing.status === 'resolved' || existing.status === 'dismissed') {
        return _updateTaskInternal(existing.id, {
          status: 'open',
          resolvedAt: '',
          description,
          title,
          severity,
          assignee: char.owner || existing.assignee,
        });
      }
      return _updateTaskInternal(existing.id, {
        description,
        title,
        severity,
        assignee: char.owner || existing.assignee,
      });
    }

    return _addTaskInternal({
      sourceType: 'handover',
      sourceId,
      story: char.story,
      characterId,
      planId: '',
      title,
      description,
      severity,
      status: 'open',
      assignee: char.owner || '',
      dueAt: '',
      resolvedAt: '',
    });
  }

  function syncHandoverNoteToTask(characterId: string, note: string): InspectionTask | null {
    const char = characters.value.find(c => c.id === characterId);
    if (!char) return null;
    const sourceId = _buildHandoverSourceId(characterId);
    const existing = _findExistingTask('handover', sourceId);
    const description = _buildHandoverTaskDescription(char, note);
    if (existing) {
      return _updateTaskInternal(existing.id, { description });
    }
    return upsertHandoverTaskForCharacter(characterId, note);
  }

  function hasObjectiveRisk(char: Character): boolean {
    return _charHasObjectiveRisk(char);
  }

  function severityFromRiskLevel(level: string): InspectionSeverity {
    if (level === 'critical') return 'critical';
    if (level === 'high') return 'high';
    if (level === 'medium') return 'medium';
    return 'low';
  }

  function syncTasksFromCharacters(): { created: number; unblocked: number; blocked: number } {
    return _syncFromCharacters(characters.value);
  }

  function blockTasksForCharacter(characterId: string): number {
    let count = 0;
    tasks.value.forEach((task, idx) => {
      if (task.characterId === characterId && task.status !== 'resolved' && task.status !== 'dismissed') {
        tasks.value[idx] = normalizeInspectionTask({
          ...task,
          status: 'blocked' as InspectionTaskStatus,
          updatedAt: new Date().toISOString(),
        });
        count++;
      }
    });
    return count;
  }

  function blockTasksForPlan(planId: string): number {
    let count = 0;
    tasks.value.forEach((task, idx) => {
      if (task.planId === planId && task.status !== 'resolved' && task.status !== 'dismissed') {
        tasks.value[idx] = normalizeInspectionTask({
          ...task,
          status: 'blocked' as InspectionTaskStatus,
          updatedAt: new Date().toISOString(),
        });
        count++;
      }
    });
    return count;
  }

  function blockRehearsalTaskForRemoval(planId: string, characterId: string): number {
    let count = 0;
    const suffix = '角色已从排练计划移除';
    tasks.value.forEach((task, idx) => {
      if (
        task.planId === planId &&
        task.characterId === characterId &&
        task.sourceType === 'rehearsal' &&
        task.sourceId === planId &&
        task.status !== 'resolved' &&
        task.status !== 'dismissed'
      ) {
        const desc = task.description || '';
        const newDesc = desc.includes(suffix) ? desc : (desc ? `${desc}；${suffix}` : suffix);
        tasks.value[idx] = normalizeInspectionTask({
          ...task,
          status: 'blocked' as InspectionTaskStatus,
          description: newDesc,
          updatedAt: new Date().toISOString(),
        });
        count++;
      }
    });
    return count;
  }

  function upsertRehearsalResultTask(
    planInfo: { id: string; name: string; story: string; owner: string },
    characterId: string,
    charName: string,
    result: 'fail' | 'need_rehearse',
    note?: string,
    checkedBy?: string
  ): { task: InspectionTask; created: boolean } {
    const { id: planId, name: planName, story, owner: planOwner } = planInfo;
    const char = characters.value.find(c => c.id === characterId);
    const sourceId = planId;
    const existing = _findExistingTask('rehearsal', sourceId);

    const isFail = result === 'fail';
    const severity: InspectionSeverity = isFail ? 'high' : 'medium';
    const title = isFail
      ? `重排${charName}（排练未通过）`
      : `复排${charName}动作配合`;
    const description =
      `排练计划「${planName}」中${charName}排练结果为"${isFail ? '未通过' : '需复排'}"。` +
      (note ? `备注：${note}` : '');

    if (existing) {
      let updated = existing;
      if (existing.status === 'blocked') {
        updated = _updateTaskInternal(existing.id, {
          status: 'open',
          description,
          title,
          severity,
          characterId,
          planId,
          assignee: existing.assignee || checkedBy || planOwner || char?.owner || '',
        })!;
      } else if (existing.status === 'resolved' || existing.status === 'dismissed') {
        updated = _updateTaskInternal(existing.id, {
          status: 'open',
          resolvedAt: '',
          description,
          title,
          severity,
          characterId,
          planId,
        })!;
      }
      return { task: updated, created: false };
    }

    const task = _addTaskInternal({
      sourceType: 'rehearsal',
      sourceId,
      story,
      characterId,
      planId,
      title,
      description,
      severity,
      status: 'open',
      assignee: checkedBy || planOwner || char?.owner || '',
      dueAt: '',
      resolvedAt: '',
    });
    return { task, created: true };
  }

  function getUnresolvedTasksByPlan(planId: string): InspectionTask[] {
    return tasks.value.filter(
      t => t.planId === planId &&
        (t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked')
    );
  }

  function getMaxSeverityForPlan(planId: string): InspectionSeverity | null {
    const unresolved = getUnresolvedTasksByPlan(planId);
    if (unresolved.length === 0) return null;
    const order: Record<InspectionSeverity, number> = {
      critical: 4, high: 3, medium: 2, low: 1,
    };
    return unresolved.reduce<InspectionSeverity>((max, t) => {
      return order[t.severity] > order[max] ? t.severity : max;
    }, 'low');
  }

  const allStories = computed(() => {
    const set = new Set(tasks.value.map(t => t.story).filter(Boolean));
    return Array.from(set).sort();
  });

  const allAssignees = computed(() => {
    const set = new Set(tasks.value.map(t => t.assignee).filter(Boolean));
    return Array.from(set).sort();
  });

  const openTaskCount = computed(() =>
    tasks.value.filter(t => t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked').length
  );

  const criticalTaskCount = computed(() =>
    tasks.value.filter(t => t.severity === 'critical' && t.status !== 'resolved' && t.status !== 'dismissed').length
  );

  function generateTaskId(): string {
    return 'task_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function exportData(): string {
    return JSON.stringify(tasks.value, null, 2);
  }

  function replaceAll(newTasks: InspectionTask[]): { count: number; duplicateIdCount: number } {
    const seen = new Set<string>();
    let duplicateIdCount = 0;
    const normalized = newTasks.map(t => {
      const nt = normalizeInspectionTask(migrateTask(t));
      if (seen.has(nt.id)) {
        nt.id = generateTaskId();
        duplicateIdCount++;
      }
      seen.add(nt.id);
      return nt;
    });
    tasks.value = normalized;
    return { count: normalized.length, duplicateIdCount };
  }

  function validateReferences(
    characterIds: Set<string>,
    planIds: Set<string>
  ): number {
    let blocked = 0;
    tasks.value.forEach((task, idx) => {
      const needsBlock =
        (task.characterId && !characterIds.has(task.characterId)) ||
        (task.planId && !planIds.has(task.planId));
      if (
        needsBlock &&
        task.status !== 'resolved' &&
        task.status !== 'dismissed' &&
        task.status !== 'blocked'
      ) {
        tasks.value[idx] = normalizeInspectionTask({
          ...task,
          status: 'blocked',
          updatedAt: new Date().toISOString(),
        });
        blocked++;
      }
    });
    return blocked;
  }

  return {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    resolveTask,
    getTasksByCharacterId,
    getUnresolvedTasksByCharacter,
    getUnresolvedTaskCountByCharacter,
    getStoryTaskStats,
    getSuggestedResolvableTasks,
    createTaskForCharacter,
    getTasksByPlanId,
    getUnresolvedTasksByPlan,
    getMaxSeverityForPlan,
    upsertRehearsalResultTask,
    getTasksByStory,
    syncTasksFromCharacters,
    blockTasksForCharacter,
    blockTasksForPlan,
    blockRehearsalTaskForRemoval,
    findExistingTask,
    buildMissingAccessorySourceId,
    buildRiskSourceId,
    buildNoOwnerSourceId,
    buildHandoverSourceId,
    getHandoverTask,
    upsertHandoverTaskForCharacter,
    syncHandoverNoteToTask,
    hasObjectiveRisk,
    severityFromRiskLevel,
    allStories,
    allAssignees,
    openTaskCount,
    criticalTaskCount,
    exportData,
    replaceAll,
    validateReferences,
  };
}
