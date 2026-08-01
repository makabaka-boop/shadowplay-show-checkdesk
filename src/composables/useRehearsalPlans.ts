import { ref, computed, watch } from 'vue';
import type { RehearsalPlan, RehearsalCharacter, RehearsalStatus, RehearsalResult, Character } from '../types';
import { normalizeRehearsalPlan } from '../types';
import { useCharacters } from './useCharacters';
import { useInspectionTasks } from './useInspectionTasks';

const STORAGE_KEY = 'shadow-puppetry-rehearsal-plans';

function generateSamplePlans(): RehearsalPlan[] {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return [
    {
      id: 'rh_sample_001',
      name: '三打白骨精 - 首次全流程排练',
      story: '三打白骨精',
      venue: '剧院一号排练厅',
      scheduledAt: tomorrow.toISOString().slice(0, 16),
      owner: '张导演',
      status: 'scheduled',
      characters: [
        { characterId: 'char_demo_001', order: 1, rehearsalResult: 'not_started', rehearsalNote: '', checkedBy: '' },
        { characterId: 'char_demo_002', order: 2, rehearsalResult: 'not_started', rehearsalNote: '', checkedBy: '' },
        { characterId: 'char_demo_003', order: 3, rehearsalResult: 'not_started', rehearsalNote: '', checkedBy: '' },
        { characterId: 'char_demo_004', order: 4, rehearsalResult: 'not_started', rehearsalNote: '', checkedBy: '' },
        { characterId: 'char_demo_005', order: 5, rehearsalResult: 'not_started', rehearsalNote: '', checkedBy: '' },
        { characterId: 'char_demo_006', order: 6, rehearsalResult: 'not_started', rehearsalNote: '', checkedBy: '' },
      ],
      problemNotes: '',
      summaryNote: '',
      createdAt: yesterday.toISOString(),
      updatedAt: yesterday.toISOString(),
    },
    {
      id: 'rh_sample_002',
      name: '木兰从军 - 角色动作排练',
      story: '木兰从军',
      venue: '剧院二号排练厅',
      scheduledAt: now.toISOString().slice(0, 16),
      owner: '李导演',
      status: 'in_progress',
      characters: [
        { characterId: 'char_demo_007', order: 1, rehearsalResult: 'pass', rehearsalNote: '动作流畅，出场效果好', checkedBy: '李导演' },
        { characterId: 'char_demo_008', order: 2, rehearsalResult: 'pass', rehearsalNote: '', checkedBy: '李导演' },
        { characterId: 'char_demo_009', order: 3, rehearsalResult: 'need_rehearse', rehearsalNote: '关节操作配合需加强', checkedBy: '李导演' },
        { characterId: 'char_demo_010', order: 4, rehearsalResult: 'not_started', rehearsalNote: '', checkedBy: '' },
        { characterId: 'char_demo_011', order: 5, rehearsalResult: 'not_started', rehearsalNote: '', checkedBy: '' },
        { characterId: 'char_demo_012', order: 6, rehearsalResult: 'not_started', rehearsalNote: '', checkedBy: '' },
      ],
      problemNotes: '单于角色动作配合需要双人操作，建议安排助手',
      summaryNote: '',
      createdAt: yesterday.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];
}

function loadFromStorage(): RehearsalPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(item => normalizeRehearsalPlan(item));
      }
    }
  } catch {
    console.warn('Failed to load rehearsal plans from storage');
  }
  return generateSamplePlans();
}

function saveToStorage(plans: RehearsalPlan[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    console.warn('Failed to save rehearsal plans to storage');
  }
}

const rehearsalPlans = ref<RehearsalPlan[]>(loadFromStorage());

watch(rehearsalPlans, (newVal) => {
  saveToStorage(newVal);
}, { deep: true });

export function useRehearsalPlans() {
  const { characters } = useCharacters();
  const {
    syncTasksFromCharacters,
    upsertRehearsalResultTask,
    resolveRehearsalResultTaskIfAuto,
    blockTasksForRemovedPlanCharacter,
  } = useInspectionTasks();

  function triggerTaskSync() {
    try { syncTasksFromCharacters(characters.value, rehearsalPlans.value); } catch { /* noop */ }
  }

  watch(characters, () => {
    cleanInvalidCharacters();
  }, { deep: true });

  watch(rehearsalPlans, () => {
    triggerTaskSync();
  }, { deep: true });

  function cleanInvalidCharacters() {
    const validIds = new Set(characters.value.map(c => c.id));
    let changed = false;
    rehearsalPlans.value.forEach((plan, idx) => {
      const valid = plan.characters.filter(c => validIds.has(c.characterId));
      if (valid.length !== plan.characters.length) {
        rehearsalPlans.value[idx] = normalizeRehearsalPlan({
          ...plan,
          characters: valid,
          updatedAt: new Date().toISOString(),
        });
        changed = true;
      }
    });
    if (changed) {
      triggerTaskSync();
    }
    return changed;
  }

  function getValidPlanCharacters(plan: RehearsalPlan): (RehearsalCharacter & { character: Character })[] {
    return plan.characters
      .map(rc => {
        const character = characters.value.find(c => c.id === rc.characterId);
        return character ? { ...rc, character } : null;
      })
      .filter(Boolean) as (RehearsalCharacter & { character: Character })[];
  }

  function generateId(): string {
    return 'rh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function addPlan(data: Omit<RehearsalPlan, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString();
    const newPlan: RehearsalPlan = normalizeRehearsalPlan({
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    });
    rehearsalPlans.value.push(newPlan);
    return newPlan;
  }

  function updatePlan(id: string, updates: Partial<RehearsalPlan>) {
    const index = rehearsalPlans.value.findIndex(p => p.id === id);
    if (index !== -1) {
      rehearsalPlans.value[index] = normalizeRehearsalPlan({
        ...rehearsalPlans.value[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      return rehearsalPlans.value[index];
    }
    return null;
  }

  function deletePlan(id: string) {
    const index = rehearsalPlans.value.findIndex(p => p.id === id);
    if (index !== -1) {
      rehearsalPlans.value.splice(index, 1);
      return true;
    }
    return false;
  }

  function getPlanById(id: string): RehearsalPlan | undefined {
    return rehearsalPlans.value.find(p => p.id === id);
  }

  function addCharacterToPlan(planId: string, characterId: string, order?: number) {
    const plan = getPlanById(planId);
    if (!plan) return null;

    if (plan.characters.some(c => c.characterId === characterId)) {
      return plan;
    }

    const newOrder = order ?? (plan.characters.length > 0
      ? Math.max(...plan.characters.map(c => c.order)) + 1
      : 1);

    const newCharacter: RehearsalCharacter = {
      characterId,
      order: newOrder,
      rehearsalResult: 'not_started',
      rehearsalNote: '',
      checkedBy: '',
    };

    return updatePlan(planId, {
      characters: [...plan.characters, newCharacter],
    });
  }

  function removeCharacterFromPlan(planId: string, characterId: string) {
    const plan = getPlanById(planId);
    if (!plan) return null;

    const character = characters.value.find(c => c.id === characterId);
    const removed = updatePlan(planId, {
      characters: plan.characters.filter(c => c.characterId !== characterId),
    });

    if (removed) {
      try {
        blockTasksForRemovedPlanCharacter(planId, characterId, character?.name);
      } catch { /* noop */ }
    }
    return removed;
  }

  function updateCharacterResult(
    planId: string,
    characterId: string,
    updates: Partial<RehearsalCharacter>
  ) {
    const plan = getPlanById(planId);
    if (!plan) return null;

    const current = plan.characters.find(c => c.characterId === characterId);
    const nextResult: RehearsalResult =
      updates.rehearsalResult !== undefined ? updates.rehearsalResult : current?.rehearsalResult || 'not_started';
    const nextNote = updates.rehearsalNote !== undefined ? updates.rehearsalNote : current?.rehearsalNote || '';
    const nextCheckedBy = updates.checkedBy !== undefined ? updates.checkedBy : current?.checkedBy || '';

    const updated = updatePlan(planId, {
      characters: plan.characters.map(c =>
        c.characterId === characterId ? { ...c, ...updates } : c
      ),
    });

    if (updated) {
      const latestPlan = getPlanById(planId);
      const character = characters.value.find(c => c.id === characterId);
      if (latestPlan && character) {
        try {
          if (nextResult === 'fail' || nextResult === 'need_rehearse') {
            upsertRehearsalResultTask(
              latestPlan,
              character,
              nextResult,
              nextNote,
              nextCheckedBy
            );
          } else if (nextResult === 'pass') {
            resolveRehearsalResultTaskIfAuto(planId, characterId);
          }
        } catch { /* noop */ }
      }
    }

    return updated;
  }

  function moveCharacterOrder(planId: string, characterId: string, direction: 'up' | 'down', visibleCharacterIds?: string[]) {
    const plan = getPlanById(planId);
    if (!plan) return null;

    let valid = getValidPlanCharacters(plan).sort((a, b) => a.order - b.order);
    if (visibleCharacterIds) {
      valid = valid.filter(rc => visibleCharacterIds.includes(rc.characterId));
    }
    const idx = valid.findIndex(c => c.characterId === characterId);
    if (idx === -1) return plan;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= valid.length) return plan;

    const targetId = valid[swapIdx].characterId;
    const all = [...plan.characters];
    const aIdx = all.findIndex(c => c.characterId === characterId);
    const bIdx = all.findIndex(c => c.characterId === targetId);
    if (aIdx === -1 || bIdx === -1) return plan;

    const tempOrder = all[aIdx].order;
    all[aIdx] = { ...all[aIdx], order: all[bIdx].order };
    all[bIdx] = { ...all[bIdx], order: tempOrder };

    return updatePlan(planId, { characters: all });
  }

  const allVenues = computed(() => {
    const set = new Set(rehearsalPlans.value.map(p => p.venue).filter(Boolean));
    return Array.from(set).sort();
  });

  const allPlanOwners = computed(() => {
    const set = new Set(rehearsalPlans.value.map(p => p.owner).filter(Boolean));
    return Array.from(set).sort();
  });

  function getPlanStats(plan: RehearsalPlan) {
    const valid = getValidPlanCharacters(plan);
    const total = valid.length;
    const pass = valid.filter(c => c.rehearsalResult === 'pass').length;
    const fail = valid.filter(c => c.rehearsalResult === 'fail').length;
    const needRehearse = valid.filter(c => c.rehearsalResult === 'need_rehearse').length;
    const notStarted = valid.filter(c => c.rehearsalResult === 'not_started').length;
    const progress = total > 0 ? Math.round(((total - notStarted) / total) * 100) : 0;
    const passRate = total > 0 && (total - notStarted) > 0 ? Math.round((pass / (total - notStarted)) * 100) : 0;

    return { total, pass, fail, needRehearse, notStarted, progress, passRate };
  }

  function exportData(): string {
    return JSON.stringify(rehearsalPlans.value, null, 2);
  }

  function importData(json: string): { success: boolean; count: number; invalidCount: number; duplicateCount: number } {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        return { success: false, count: 0, invalidCount: 0, duplicateCount: 0 };
      }
      const existingIds = new Set(rehearsalPlans.value.map(p => p.id));
      const normalized: RehearsalPlan[] = [];
      let invalidCount = 0;
      let duplicateCount = 0;

      parsed.forEach((item) => {
        if (!item || typeof item !== 'object') {
          invalidCount++;
          return;
        }
        try {
          let plan = normalizeRehearsalPlan(item);
          if (existingIds.has(plan.id)) {
            plan = normalizeRehearsalPlan({
              ...plan,
              id: 'rh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            });
            duplicateCount++;
          }
          existingIds.add(plan.id);
          normalized.push(plan);
        } catch {
          invalidCount++;
        }
      });

      rehearsalPlans.value = normalized;
      return { success: true, count: normalized.length, invalidCount, duplicateCount };
    } catch {
      return { success: false, count: 0, invalidCount: 0, duplicateCount: 0 };
    }
  }

  return {
    rehearsalPlans,
    addPlan,
    updatePlan,
    deletePlan,
    getPlanById,
    addCharacterToPlan,
    removeCharacterFromPlan,
    updateCharacterResult,
    moveCharacterOrder,
    allVenues,
    allPlanOwners,
    getPlanStats,
    getValidPlanCharacters,
    cleanInvalidCharacters,
    exportData,
    importData,
  };
}
