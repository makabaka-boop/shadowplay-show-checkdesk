import { useCharacters } from './useCharacters';
import { useRehearsalPlans } from './useRehearsalPlans';
import { useInspectionTasks } from './useInspectionTasks';
import { BACKUP_PACKAGE_VERSION, normalizeBackupPackage } from '../types';
import type { CheckdeskBackupPackage } from '../types';

export interface BackupImportResult {
  success: boolean;
  version: number;
  characterCount: number;
  rehearsalPlanCount: number;
  inspectionTaskCount: number;
  duplicateCount: number;
  blockedCount: number;
  invalidCount: number;
  error?: string;
}

export function useBackupPackage() {
  const { characters, importData: importCharacters } = useCharacters();
  const { rehearsalPlans, importData: importRehearsalPlans } = useRehearsalPlans();
  const { importData: importTasks, reconcileWithReferences } = useInspectionTasks();

  function exportPackage(): string {
    const pkg: CheckdeskBackupPackage = {
      version: BACKUP_PACKAGE_VERSION,
      exportedAt: new Date().toISOString(),
      characters: JSON.parse(JSON.stringify(characters.value)),
      rehearsalPlans: JSON.parse(JSON.stringify(rehearsalPlans.value)),
      inspectionTasks: (() => {
        const { tasks } = useInspectionTasks();
        return JSON.parse(JSON.stringify(tasks.value));
      })(),
    };
    return JSON.stringify(pkg, null, 2);
  }

  function isBackupPackage(raw: any): boolean {
    return raw
      && typeof raw === 'object'
      && (raw.version === 2 || raw.version === 1)
      && Array.isArray(raw.characters);
  }

  function importPackage(jsonStr: string): BackupImportResult {
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return {
        success: false,
        version: 0,
        characterCount: 0,
        rehearsalPlanCount: 0,
        inspectionTaskCount: 0,
        duplicateCount: 0,
        blockedCount: 0,
        invalidCount: 0,
        error: '文件格式不正确或内容已损坏',
      };
    }

    if (!isBackupPackage(parsed)) {
      return {
        success: false,
        version: 0,
        characterCount: 0,
        rehearsalPlanCount: 0,
        inspectionTaskCount: 0,
        duplicateCount: 0,
        blockedCount: 0,
        invalidCount: 0,
        error: '不是合法的检查台备份包（缺少 version 或 characters 字段）',
      };
    }

    const pkg = normalizeBackupPackage(parsed);

    const charResult = importCharacters(JSON.stringify(pkg.characters));
    if (!charResult.success) {
      return {
        success: false,
        version: pkg.version,
        characterCount: 0,
        rehearsalPlanCount: 0,
        inspectionTaskCount: 0,
        duplicateCount: 0,
        blockedCount: 0,
        invalidCount: 0,
        error: '角色数据恢复失败',
      };
    }

    const planResult = importRehearsalPlans(JSON.stringify(pkg.rehearsalPlans));
    const taskResult = importTasks(JSON.stringify(pkg.inspectionTasks));

    const validCharacterIds = new Set(characters.value.map(c => c.id));
    const validPlanIds = new Set(rehearsalPlans.value.map(p => p.id));
    const additionalBlocked = reconcileWithReferences(validCharacterIds, validPlanIds);

    const totalDuplicates =
      (charResult.duplicateCount || 0) +
      (planResult.duplicateCount || 0) +
      (taskResult.duplicateCount || 0);

    const totalInvalid =
      (charResult.invalidCount || 0) +
      (planResult.invalidCount || 0) +
      (taskResult.invalidCount || 0);

    return {
      success: true,
      version: pkg.version,
      characterCount: charResult.count,
      rehearsalPlanCount: planResult.count,
      inspectionTaskCount: taskResult.count,
      duplicateCount: totalDuplicates,
      blockedCount: (taskResult.blockedCount || 0) + additionalBlocked,
      invalidCount: totalInvalid,
    };
  }

  return {
    exportPackage,
    importPackage,
    isBackupPackage,
  };
}
