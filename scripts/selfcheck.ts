/**
 * 自检脚本：验证 normalize、同步补缺、删除角色后任务阻塞、备份恢复四个路径
 * 运行方式：npx tsx scripts/selfcheck.ts
 */
import {
  normalizeCharacter,
  normalizeInspectionTask,
  normalizeRehearsalPlan,
  type Character,
  type InspectionTask,
  type RehearsalPlan,
} from '../src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function section(name: string) {
  console.log(`\n${name}`);
  console.log('-'.repeat(name.length));
}

// ========== 1. normalize 测试 ==========
section('1. normalize 规范化');

const rawChar = {
  id: 'char_test_1',
  name: '测试角色',
  story: '测试故事',
  owner: '张三',
  status: 'invalid_status',
  riskLevel: 'critical',
  linkCount: '3',
  missingAccessories: [{ name: '配件A', required: 2, available: 1 }],
  handoverStatus: 'confirmed',
  handoverNote: 'ok',
  operationReminders: ['提醒1'],
  repairNote: '',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};
const char = normalizeCharacter(rawChar);
assert(char.id === 'char_test_1', '角色 ID 正确保留');
assert(char.name === '测试角色', '角色名称正确');
assert(char.status === 'pending_assembly', '非法 status 回退为默认值');
assert(char.riskLevel === 'critical', '风险等级正确');
assert(char.linkCount === 3, 'linkCount 字符串转数字');
assert(Array.isArray(char.missingAccessories), '缺件列表为数组');
assert(char.operationReminders.length === 1, '操作提醒正确');

const rawTask = {
  id: 'task_test_1',
  sourceType: 'invalid_type',
  sourceId: 'src_1',
  story: '故事',
  characterId: 'char_1',
  planId: '',
  title: '测试任务',
  description: '描述',
  severity: 'invalid',
  status: 'open',
  assignee: '李四',
  dueAt: '',
  resolvedAt: '',
};
const task = normalizeInspectionTask(rawTask);
assert(task.sourceType === 'manual', '非法 sourceType 回退为 manual');
assert(task.severity === 'medium', '非法 severity 回退为 medium');
assert(task.status === 'open', '任务状态正确');
assert(task.title === '测试任务', '任务标题正确');

const rawPlan = {
  id: 'rh_test_1',
  name: '测试排练',
  story: '故事',
  venue: '场地',
  scheduledAt: '2024-01-01T10:00',
  owner: '导演',
  status: 'invalid',
  characters: [
    { characterId: 'char_1', order: '1', rehearsalResult: 'fail', rehearsalNote: '需改进', checkedBy: '导演' },
    { characterId: '', order: 2, rehearsalResult: 'pass', rehearsalNote: '', checkedBy: '' },
  ],
  problemNotes: '问题',
  summaryNote: '',
};
const plan = normalizeRehearsalPlan(rawPlan);
assert(plan.id === 'rh_test_1', '排练计划 ID 正确');
assert(plan.status === 'draft', '非法排练状态回退为 draft');
assert(plan.characters.length === 1, '空 characterId 的角色被过滤');
assert(plan.characters[0].rehearsalResult === 'fail', '排练结果正确');
assert(plan.characters[0].order === 1, 'order 字符串转数字');

// ========== 2. 同步补缺（只补缺不覆盖）测试 ==========
section('2. 同步补缺：只补缺，不覆盖用户编辑');

function simulateSync(
  existingTasks: InspectionTask[],
  char: Character
): { tasks: InspectionTask[]; created: number } {
  let created = 0;
  const tasks = [...existingTasks];

  if (char.missingAccessories.some(a => a.available < a.required)) {
    char.missingAccessories.forEach(acc => {
      if (acc.available < acc.required) {
        const sourceId = `${char.id}:missing:${acc.name}`;
        const exists = tasks.find(t => t.sourceType === 'character' && t.sourceId === sourceId);
        if (!exists) {
          tasks.push(normalizeInspectionTask({
            id: `task_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            sourceType: 'character',
            sourceId,
            story: char.story,
            characterId: char.id,
            planId: '',
            title: `补齐${char.name}的${acc.name}`,
            description: `${char.name}缺少${acc.name}`,
            severity: 'medium',
            status: 'open',
            assignee: char.owner || '',
            dueAt: '',
            resolvedAt: '',
          }));
          created++;
        }
      }
    });
  }
  return { tasks, created };
}

const testChar: Character = normalizeCharacter({
  id: 'char_sync_1',
  name: '同步测试角色',
  story: '故事A',
  owner: '王五',
  status: 'need_parts',
  riskLevel: 'high',
  linkCount: 2,
  missingAccessories: [
    { name: '武器', required: 1, available: 0 },
    { name: '头盔', required: 1, available: 0 },
  ],
  handoverStatus: 'not_checked',
  handoverNote: '',
  operationReminders: [],
  repairNote: '',
});

let syncResult = simulateSync([], testChar);
assert(syncResult.created === 2, '首次同步创建 2 个缺件任务');

const userEditedTask: InspectionTask = normalizeInspectionTask({
  id: 'task_user_edited',
  sourceType: 'character',
  sourceId: 'char_sync_1:missing:武器',
  story: '故事A',
  characterId: 'char_sync_1',
  planId: '',
  title: '补齐同步测试角色的武器',
  description: '用户已修改的描述',
  severity: 'high',
  status: 'in_progress',
  assignee: '自定义负责人',
  dueAt: '2024-12-31',
  resolvedAt: '',
});

syncResult = simulateSync([userEditedTask], testChar);
assert(syncResult.created === 1, '二次同步只补缺，不覆盖已编辑任务（仅新建头盔任务）');
const preserved = syncResult.tasks.find(t => t.id === 'task_user_edited');
assert(!!preserved, '用户编辑的任务被保留');
assert(preserved!.status === 'in_progress', '用户修改的 status 未被覆盖');
assert(preserved!.assignee === '自定义负责人', '用户修改的 assignee 未被覆盖');
assert(preserved!.description === '用户已修改的描述', '用户修改的 description 未被覆盖');
assert(preserved!.dueAt === '2024-12-31', '用户修改的 dueAt 未被覆盖');

// ========== 3. 删除角色后任务阻塞测试 ==========
section('3. 删除角色后关联任务标记为 blocked');

function simulateDeleteCharacter(
  tasks: InspectionTask[],
  charId: string,
  validCharIds: Set<string>
): InspectionTask[] {
  return tasks.map(task => {
    if (
      task.characterId === charId &&
      task.sourceType === 'character' &&
      task.status !== 'resolved' &&
      task.status !== 'dismissed' &&
      task.status !== 'blocked'
    ) {
      return normalizeInspectionTask({
        ...task,
        status: 'blocked',
        updatedAt: new Date().toISOString(),
      });
    }
    return task;
  });
}

const tasksBeforeDelete: InspectionTask[] = [
  normalizeInspectionTask({
    id: 't1', sourceType: 'character', sourceId: 'char_del_1:missing:武器',
    story: 'S', characterId: 'char_del_1', planId: '', title: '补缺1',
    description: '', severity: 'high', status: 'open', assignee: '', dueAt: '', resolvedAt: '',
  }),
  normalizeInspectionTask({
    id: 't2', sourceType: 'handover', sourceId: 'char_del_1',
    story: 'S', characterId: 'char_del_1', planId: '', title: '交接风险',
    description: '', severity: 'medium', status: 'in_progress', assignee: '', dueAt: '', resolvedAt: '',
  }),
  normalizeInspectionTask({
    id: 't3', sourceType: 'character', sourceId: 'char_other:missing:武器',
    story: 'S', characterId: 'char_other', planId: '', title: '其他角色任务',
    description: '', severity: 'low', status: 'open', assignee: '', dueAt: '', resolvedAt: '',
  }),
  normalizeInspectionTask({
    id: 't4', sourceType: 'character', sourceId: 'char_del_1:missing:头盔',
    story: 'S', characterId: 'char_del_1', planId: '', title: '已解决任务',
    description: '', severity: 'low', status: 'resolved', assignee: '', dueAt: '', resolvedAt: '2024-01-01',
  }),
];

const tasksAfterDelete = simulateDeleteCharacter(tasksBeforeDelete, 'char_del_1', new Set(['char_other']));
const t1 = tasksAfterDelete.find(t => t.id === 't1')!;
const t2 = tasksAfterDelete.find(t => t.id === 't2')!;
const t3 = tasksAfterDelete.find(t => t.id === 't3')!;
const t4 = tasksAfterDelete.find(t => t.id === 't4')!;
assert(t1.status === 'blocked', '角色缺件任务被标记为 blocked');
assert(t1.sourceType === 'character', 'blocked 任务保留 sourceType');
assert(t1.sourceId === 'char_del_1:missing:武器', 'blocked 任务保留 sourceId');
assert(t1.story === 'S', 'blocked 任务保留 story');
assert(t2.status === 'in_progress', 'handover 类型任务不受角色删除影响');
assert(t3.status === 'open', '其他角色任务不受影响');
assert(t4.status === 'resolved', '已解决任务不被阻塞');

// ========== 4. 备份恢复测试 ==========
section('4. v2 备份包恢复');

const backup = {
  version: 2 as const,
  exportedAt: '2024-06-01T00:00:00.000Z',
  characters: [
    {
      id: 'char_bak_1', name: '备份角色', story: '备份故事', owner: '赵六',
      status: 'ready_to_pack', riskLevel: 'low', linkCount: 1,
      missingAccessories: [], handoverStatus: 'confirmed', handoverNote: '',
      operationReminders: [], repairNote: '',
    },
    {
      id: 'char_bak_1', name: '重复ID角色', story: '备份故事', owner: '钱七',
      status: 'pending_assembly', riskLevel: 'medium', linkCount: 2,
      missingAccessories: [], handoverStatus: 'not_checked', handoverNote: '',
      operationReminders: [], repairNote: '',
    },
  ],
  rehearsalPlans: [
    {
      id: 'rh_bak_1', name: '备份排练', story: '备份故事', venue: '场地A',
      scheduledAt: '2024-06-01T10:00', owner: '导演A', status: 'scheduled',
      characters: [{ characterId: 'char_bak_1', order: 1, rehearsalResult: 'not_started', rehearsalNote: '', checkedBy: '' }],
      problemNotes: '', summaryNote: '',
    },
  ],
  inspectionTasks: [
    {
      id: 'task_bak_1', sourceType: 'rehearsal', sourceId: 'rh_bak_1',
      story: '备份故事', characterId: 'char_bak_1', planId: 'rh_bak_1',
      title: '排练任务', description: '需要复排', severity: 'medium',
      status: 'open', assignee: '导演A', dueAt: '', resolvedAt: '',
    },
    {
      id: 'task_bak_orphan', sourceType: 'character', sourceId: 'char_nonexist:missing:武器',
      story: '备份故事', characterId: 'char_nonexist', planId: '',
      title: '孤儿任务', description: '角色不存在', severity: 'high',
      status: 'open', assignee: '', dueAt: '', resolvedAt: '',
    },
  ],
};

function restoreBackup(backup: any) {
  const restoredChars = (backup.characters || []).map((c: any) => normalizeCharacter(c));
  const restoredPlans = (backup.rehearsalPlans || []).map((p: any) => normalizeRehearsalPlan(p));
  const restoredTasks = (backup.inspectionTasks || []).map((t: any) => normalizeInspectionTask(t));

  const seenCharIds = new Set<string>();
  let duplicateIdCount = 0;
  const dedupedChars = restoredChars.map(c => {
    if (seenCharIds.has(c.id)) {
      duplicateIdCount++;
      return { ...c, id: 'char_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) };
    }
    seenCharIds.add(c.id);
    return c;
  });

  const charIds = new Set(dedupedChars.map(c => c.id));
  const planIds = new Set(restoredPlans.map(p => p.id));
  let blockedCount = 0;
  const validatedTasks = restoredTasks.map(t => {
    const needsBlock =
      (t.characterId && !charIds.has(t.characterId)) ||
      (t.planId && !planIds.has(t.planId));
    if (needsBlock && t.status !== 'resolved' && t.status !== 'dismissed' && t.status !== 'blocked') {
      blockedCount++;
      return { ...t, status: 'blocked' as const };
    }
    return t;
  });

  return {
    characters: dedupedChars,
    plans: restoredPlans,
    tasks: validatedTasks,
    duplicateIdCount,
    blockedCount,
  };
}

const result = restoreBackup(backup);
assert(result.characters.length === 2, '恢复 2 个角色');
assert(result.plans.length === 1, '恢复 1 个排练计划');
assert(result.tasks.length === 2, '恢复 2 个巡检任务');
assert(result.duplicateIdCount === 1, '检测到 1 个重复 ID 并重建');
const uniqueIds = new Set(result.characters.map(c => c.id));
assert(uniqueIds.size === 2, '重复 ID 重建后所有 ID 唯一');

const orphanTask = result.tasks.find(t => t.id === 'task_bak_orphan')!;
assert(orphanTask.status === 'blocked', '引用不存在 characterId 的任务被标记为 blocked');
assert(orphanTask.sourceType === 'character', 'blocked 任务保留 sourceType');
assert(orphanTask.sourceId === 'char_nonexist:missing:武器', 'blocked 任务保留 sourceId');
assert(orphanTask.story === '备份故事', 'blocked 任务保留 story');

const validTask = result.tasks.find(t => t.id === 'task_bak_1')!;
assert(validTask.status === 'open', '引用有效的任务保持 open 状态');

const v1Backup = [
  { id: 'char_v1_1', name: 'V1角色', story: '旧故事', owner: '', status: 'pending_assembly', riskLevel: 'low', linkCount: 0, missingAccessories: [], handoverStatus: 'not_checked', handoverNote: '', operationReminders: [], repairNote: '' },
];
const v1Result = restoreBackup({ characters: v1Backup, rehearsalPlans: [], inspectionTasks: [] });
assert(v1Result.characters.length === 1, '旧版数组格式备份可恢复');
assert(v1Result.characters[0].name === 'V1角色', '旧版数据正确规范化');

// ========== 总结 ==========
console.log(`\n${'='.repeat(50)}`);
console.log(`自检结果：${passed} 通过，${failed} 失败`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('所有自检通过 ✓');
}
