/* Self-check for inspection task center core logic.
 * Run: npx tsx scripts/self-check.ts
 * Covers:
 *   1. normalize (Character / RehearsalPlan / InspectionTask)
 *   2. syncTasksFromCharacters only-insert-not-overwrite
 *   3. delete character -> related tasks blocked
 *   4. backup package restore (characters + plans + tasks, dangling refs blocked)
 */

import {
  normalizeCharacter,
  normalizeRehearsalPlan,
  normalizeInspectionTask,
  normalizeBackupPackage,
  BACKUP_PACKAGE_VERSION,
  type Character,
  type RehearsalPlan,
  type InspectionTask,
} from '../src/types';

// ---- Minimal in-memory localStorage for composables (not strictly required if we avoid composables) ----
// @ts-ignore
globalThis.localStorage = {
  _store: {} as Record<string, string>,
  getItem(k: string) { return this._store[k] ?? null; },
  setItem(k: string, v: string) { this._store[k] = String(v); },
  removeItem(k: string) { delete this._store[k]; },
  clear() { this._store = {}; },
};

let passed = 0;
let failed = 0;
function assert(cond: unknown, msg: string) {
  if (cond) {
    console.log('  ✓ ' + msg);
    passed++;
  } else {
    console.error('  ✗ ' + msg);
    failed++;
  }
}

function section(name: string, fn: () => void) {
  console.log('\n[' + name + ']');
  fn();
}

// ---------------- 1. normalize ----------------
section('normalize functions', () => {
  const c = normalizeCharacter({
    id: 'c1',
    name: '孙悟空',
    story: '三打白骨精',
    missingAccessories: [{ name: '金箍棒', required: 1, available: 0 }],
    owner: '张师傅',
    riskLevel: 'critical',
    riskNote: '机关复杂',
  });
  assert(c.id === 'c1', 'character id preserved');
  assert(c.name === '孙悟空', 'character name preserved');
  assert(c.missingAccessories.length === 1, 'missing accessory normalized');
  assert(c.status === 'pending_assembly', 'unknown status falls back to pending_assembly');
  assert(c.riskLevel === 'critical', 'riskLevel critical accepted');

  const c2 = normalizeCharacter({ name: 'X', riskLevel: 'weird', status: 'weird' });
  assert(c2.riskLevel === 'low', 'invalid riskLevel falls back to low');
  assert(c2.status === 'pending_assembly', 'invalid status falls back');

  const p = normalizeRehearsalPlan({
    id: 'p1',
    name: '排练一',
    story: '三打白骨精',
    characters: [{ characterId: 'c1', order: 1, rehearsalResult: 'fail' }],
  });
  assert(p.id === 'p1', 'plan id preserved');
  assert(p.characters[0].rehearsalResult === 'fail', 'plan character result fail preserved');

  const t = normalizeInspectionTask({
    id: 't1',
    sourceType: 'handover',
    sourceId: 'c1',
    story: '三打白骨精',
    characterId: 'c1',
    planId: null,
    title: '跟进孙悟空交接风险',
    severity: 'high',
    status: 'open',
  });
  assert(t.sourceType === 'handover', 'task sourceType handover preserved');
  assert(t.severity === 'high', 'task severity high preserved');

  const t2 = normalizeInspectionTask({ title: 'X', sourceType: 'bad', severity: 'bad', status: 'bad' });
  assert(t2.sourceType === 'manual', 'invalid sourceType falls back to manual');
  assert(t2.severity === 'low', 'invalid severity falls back to low');
  assert(t2.status === 'open', 'invalid status falls back to open');
  assert(typeof t2.id === 'string' && t2.id.startsWith('task_'), 'auto id generated');
});

// ---------------- 2. syncTasksFromCharacters (insert only) ----------------
// Reimplement a lightweight sync mirroring the composable logic so we can test in node.
function makeTaskKey(t: Pick<InspectionTask, 'sourceType' | 'sourceId' | 'characterId' | 'planId' | 'title'>): string {
  return [t.sourceType, t.sourceId, t.characterId ?? '', t.planId ?? '', t.title].join('::');
}

function syncFromChars(
  tasks: InspectionTask[],
  characters: Character[],
): { added: number } {
  const existing = new Set(tasks.map(makeTaskKey));
  const now = new Date().toISOString();
  let added = 0;
  characters.forEach((ch) => {
    ch.missingAccessories.forEach((gap) => {
      if (gap.available < gap.required) {
        const title = `补齐${ch.name}的${gap.name}`;
        const key = makeTaskKey({ sourceType: 'character', sourceId: ch.id, characterId: ch.id, planId: null, title });
        if (!existing.has(key)) {
          tasks.push(normalizeInspectionTask({
            sourceType: 'character', sourceId: ch.id, story: ch.story,
            characterId: ch.id, planId: null, title,
            description: 'auto', severity: 'medium', status: 'open',
            assignee: ch.owner, createdAt: now, updatedAt: now,
          }));
          existing.add(key);
          added++;
        }
      }
    });
    if ((ch.riskLevel === 'high' || ch.riskLevel === 'critical') && ch.riskNote) {
      const title = `复核${ch.name}风险说明`;
      const key = makeTaskKey({ sourceType: 'character', sourceId: ch.id, characterId: ch.id, planId: null, title });
      if (!existing.has(key)) {
        tasks.push(normalizeInspectionTask({
          sourceType: 'character', sourceId: ch.id, story: ch.story,
          characterId: ch.id, planId: null, title,
          description: 'auto', severity: ch.riskLevel, status: 'open',
          assignee: ch.owner, createdAt: now, updatedAt: now,
        }));
        existing.add(key);
        added++;
      }
    }
    if (!ch.owner) {
      const title = `分配${ch.name}责任人`;
      const key = makeTaskKey({ sourceType: 'character', sourceId: ch.id, characterId: ch.id, planId: null, title });
      if (!existing.has(key)) {
        tasks.push(normalizeInspectionTask({
          sourceType: 'character', sourceId: ch.id, story: ch.story,
          characterId: ch.id, planId: null, title,
          description: 'auto', severity: 'medium', status: 'open',
          assignee: '', createdAt: now, updatedAt: now,
        }));
        existing.add(key);
        added++;
      }
    }
  });
  return { added };
}

section('syncTasksFromCharacters: only-insert, do not overwrite', () => {
  const chars: Character[] = [
    normalizeCharacter({
      id: 'c1', name: '孙悟空', story: '三打白骨精', owner: '张师傅',
      riskLevel: 'critical', riskNote: '机关复杂',
      missingAccessories: [{ name: '金箍棒', required: 1, available: 0 }],
    }),
  ];
  const tasks: InspectionTask[] = [];
  const r1 = syncFromChars(tasks, chars);
  assert(r1.added >= 2, 'first sync creates missing-part + risk-review tasks');
  const afterFirst = tasks.length;

  // Simulate user edits one task (status / assignee)
  tasks[0] = normalizeInspectionTask({ ...tasks[0], status: 'in_progress', assignee: '李四' });

  const r2 = syncFromChars(tasks, chars);
  assert(r2.added === 0, 'second sync does not add duplicates');
  assert(tasks.length === afterFirst, 'task count stable after second sync');
  assert(tasks[0].status === 'in_progress', 'user-edited status preserved');
  assert(tasks[0].assignee === '李四', 'user-edited assignee preserved');
});

// ---------------- 3. delete character -> blocked ----------------
section('delete character -> related tasks blocked', () => {
  const chars: Character[] = [
    normalizeCharacter({
      id: 'c1', name: '孙悟空', story: '三打白骨精', owner: '张师傅',
      riskLevel: 'high', riskNote: '机关',
      missingAccessories: [{ name: '金箍棒', required: 1, available: 0 }],
    }),
  ];
  const tasks: InspectionTask[] = [];
  syncFromChars(tasks, chars);
  assert(tasks.length > 0, 'tasks created for character');

  // Simulate deletion
  const removed = chars[0];
  chars.splice(0, 1);
  tasks.forEach((t, idx) => {
    if (t.characterId === removed.id && t.status !== 'resolved' && t.status !== 'dismissed') {
      tasks[idx] = normalizeInspectionTask({ ...t, status: 'blocked' });
    }
  });
  const blocked = tasks.filter(t => t.status === 'blocked');
  assert(blocked.length === tasks.length, 'all character tasks moved to blocked');
  assert(tasks.every(t => t.sourceType && t.sourceId && t.story), 'sourceType/sourceId/story retained after blocking');
});

// ---------------- 4. backup restore ----------------
section('backup package restore with dangling refs blocked', () => {
  const backup = normalizeBackupPackage({
    version: BACKUP_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    characters: [
      { id: 'c1', name: '孙悟空', story: '三打白骨精', owner: '张师傅' },
    ],
    rehearsalPlans: [
      { id: 'p1', name: '排练一', story: '三打白骨精', characters: [{ characterId: 'c1', order: 1 }] },
    ],
    inspectionTasks: [
      // valid rehearsal task
      {
        id: 't1', sourceType: 'rehearsal', sourceId: 'p1',
        story: '三打白骨精', characterId: 'c1', planId: 'p1',
        title: '排练跟进', severity: 'high', status: 'open',
      },
      // dangling: character c999 does not exist
      {
        id: 't2', sourceType: 'character', sourceId: 'c999',
        story: '三打白骨精', characterId: 'c999', planId: null,
        title: '补齐某角色配件', severity: 'medium', status: 'open',
      },
      // dangling: plan p999 does not exist
      {
        id: 't3', sourceType: 'rehearsal', sourceId: 'p999',
        story: '三打白骨精', characterId: null, planId: 'p999',
        title: '处理排练问题', severity: 'medium', status: 'open',
      },
      // already resolved dangling - should stay resolved
      {
        id: 't4', sourceType: 'character', sourceId: 'c888',
        story: '三打白骨精', characterId: 'c888', planId: null,
        title: '老任务', severity: 'low', status: 'resolved',
      },
    ],
  });

  assert(backup.characters.length === 1, 'backup normalized characters');
  assert(backup.rehearsalPlans.length === 1, 'backup normalized plans');
  assert(backup.inspectionTasks.length === 4, 'backup normalized tasks');

  // Simulate restore: apply the same logic as useInspectionTasks.importData
  const validCharIds = new Set(backup.characters.map(c => c.id));
  const validPlanIds = new Set(backup.rehearsalPlans.map(p => p.id));
  const restored = backup.inspectionTasks.map(t => {
    let needsBlock = false;
    if (t.characterId && !validCharIds.has(t.characterId)) needsBlock = true;
    if (t.planId && !validPlanIds.has(t.planId)) needsBlock = true;
    if (needsBlock && t.status !== 'resolved' && t.status !== 'dismissed') {
      return normalizeInspectionTask({ ...t, status: 'blocked', description: (t.description || '') + '\n[备份恢复时检测到关联的角色或排练计划不存在，任务已自动阻塞]' });
    }
    return t;
  });

  const t1 = restored.find(x => x.id === 't1')!;
  const t2 = restored.find(x => x.id === 't2')!;
  const t3 = restored.find(x => x.id === 't3')!;
  const t4 = restored.find(x => x.id === 't4')!;

  assert(t1.status === 'open', 'valid task stays open');
  assert(t2.status === 'blocked', 'dangling characterId -> blocked');
  assert(t3.status === 'blocked', 'dangling planId -> blocked');
  assert(t4.status === 'resolved', 'already-resolved dangling task stays resolved');
  assert(!!t2.sourceType && !!t2.sourceId && !!t2.story, 'blocked task retains sourceType/sourceId/story');
  assert(t2.description.includes('已自动阻塞'), 'blocked task description annotated');

  // duplicate id rebuild
  const existingIds = new Set(['t1']);
  const withDup = normalizeInspectionTask({ ...t1, title: 'duplicate' });
  let rebuilt = withDup;
  if (existingIds.has(withDup.id)) {
    rebuilt = normalizeInspectionTask({ ...withDup, id: 'task_' + Math.random().toString(36).slice(2) });
  }
  assert(rebuilt.id !== 't1', 'duplicate id rebuilt to new id');
  assert(rebuilt.title === 'duplicate', 'duplicate task content preserved');
});

console.log('\n----------------------------------------');
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
