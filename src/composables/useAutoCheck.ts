import { computed } from 'vue';
import type { CheckResult, Character } from '../types';
import { useCharacters } from './useCharacters';
import { useInspectionTasks } from './useInspectionTasks';

export function useAutoCheck() {
  const { characters } = useCharacters();
  const { tasks } = useInspectionTasks();

  function hasMissingAccessories(char: Character): boolean {
    return char.missingAccessories.some(a => a.available < a.required);
  }

  function isHighRisk(char: Character): boolean {
    return char.riskLevel === 'high' || char.riskLevel === 'critical';
  }

  function getUnresolvedTaskCount(charId: string): number {
    return tasks.value.filter(
      t => t.characterId === charId && t.status !== 'resolved' && t.status !== 'dismissed'
    ).length;
  }

  function hasUnresolvedTasks(charId: string): boolean {
    return getUnresolvedTaskCount(charId) > 0;
  }

  const pendingTaskCountByCharacter = computed<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    tasks.value.forEach(t => {
      if (t.characterId && t.status !== 'resolved' && t.status !== 'dismissed') {
        map[t.characterId] = (map[t.characterId] || 0) + 1;
      }
    });
    return map;
  });

  const allCheckResults = computed<CheckResult[]>(() => {
    const results: CheckResult[] = [];
    const chars = characters.value;

    // 1. 检查演示顺序重复
    const orderMap = new Map<number, string[]>();
    chars.forEach(c => {
      if (!orderMap.has(c.demoOrder)) {
        orderMap.set(c.demoOrder, []);
      }
      orderMap.get(c.demoOrder)!.push(c.id);
    });
    const duplicateOrderIds: string[] = [];
    orderMap.forEach((ids, order) => {
      if (ids.length > 1) {
        duplicateOrderIds.push(...ids);
      }
    });
    if (duplicateOrderIds.length > 0) {
      results.push({
        type: 'error',
        message: `存在 ${duplicateOrderIds.length} 个角色的演示顺序重复`,
        characterIds: duplicateOrderIds,
      });
    }

    // 2. 检查连杆数量异常 (0 或 > 20)
    const abnormalLinkIds = chars
      .filter(c => c.linkCount <= 0 || c.linkCount > 20)
      .map(c => c.id);
    if (abnormalLinkIds.length > 0) {
      results.push({
        type: 'warning',
        message: `${abnormalLinkIds.length} 个角色连杆数量异常（≤0 或 > 20）`,
        characterIds: abnormalLinkIds,
      });
    }

    // 3. 检查同故事高风险角色过多 (> 3个)
    const storyRiskCount = new Map<string, string[]>();
    chars.forEach(c => {
      if (isHighRisk(c)) {
        if (!storyRiskCount.has(c.story)) {
          storyRiskCount.set(c.story, []);
        }
        storyRiskCount.get(c.story)!.push(c.id);
      }
    });
    const tooManyRiskIds: string[] = [];
    storyRiskCount.forEach((ids, story) => {
      if (ids.length > 3) {
        tooManyRiskIds.push(...ids);
        results.push({
          type: 'warning',
          message: `故事「${story}」有 ${ids.length} 个高风险角色（超过3个）`,
          characterIds: ids,
        });
      }
    });

    // 4. 检查责任人为空
    const noOwnerIds = chars.filter(c => !c.owner.trim()).map(c => c.id);
    if (noOwnerIds.length > 0) {
      results.push({
        type: 'warning',
        message: `${noOwnerIds.length} 个角色未指定责任人`,
        characterIds: noOwnerIds,
      });
    }

    // 5. 检查补件备注缺失（状态为需补件但无修补备注）
    const missingRepairNoteIds = chars
      .filter(c => c.status === 'need_parts' && !c.repairNote.trim())
      .map(c => c.id);
    if (missingRepairNoteIds.length > 0) {
      results.push({
        type: 'warning',
        message: `${missingRepairNoteIds.length} 个需补件角色缺少修补备注`,
        characterIds: missingRepairNoteIds,
      });
    }

    // 6. 检查配件缺口
    const missingPartsIds = chars.filter(hasMissingAccessories).map(c => c.id);
    if (missingPartsIds.length > 0) {
      results.push({
        type: 'info',
        message: `${missingPartsIds.length} 个角色存在配件缺口`,
        characterIds: missingPartsIds,
      });
    }

    // 7. 检查存在未解决巡检任务的角色
    const pendingTaskCharIds = chars
      .filter(c => hasUnresolvedTasks(c.id))
      .map(c => c.id);
    if (pendingTaskCharIds.length > 0) {
      const totalPending = pendingTaskCharIds.reduce(
        (sum, id) => sum + getUnresolvedTaskCount(id),
        0
      );
      results.push({
        type: 'warning',
        message: `${pendingTaskCharIds.length} 个角色存在 ${totalPending} 个未解决巡检任务`,
        characterIds: pendingTaskCharIds,
      });
    }

    return results;
  });

  function getCharacterIssues(charId: string): CheckResult[] {
    return allCheckResults.value.filter(r => r.characterIds.includes(charId));
  }

  function characterHasIssues(charId: string): boolean {
    return allCheckResults.value.some(r => r.characterIds.includes(charId));
  }

  const hasAnyIssues = computed(() => allCheckResults.value.length > 0);

  const errorCount = computed(() =>
    allCheckResults.value.filter(r => r.type === 'error').length
  );

  const warningCount = computed(() =>
    allCheckResults.value.filter(r => r.type === 'warning').length
  );

  return {
    allCheckResults,
    getCharacterIssues,
    characterHasIssues,
    hasAnyIssues,
    errorCount,
    warningCount,
    hasMissingAccessories,
    isHighRisk,
    getUnresolvedTaskCount,
    hasUnresolvedTasks,
    pendingTaskCountByCharacter,
  };
}
