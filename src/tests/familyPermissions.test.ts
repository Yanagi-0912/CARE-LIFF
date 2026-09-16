import { describe, expect, it } from 'vitest';
import {
  canManageAppointments,
  canManageMedications,
  canReadHealthRecords,
  canRecordHealthFor,
} from '../utils/familyPermissions';
import type { FamilyMember } from '../types/family';

function member(overrides: Partial<FamilyMember>): FamilyMember {
  return { user_id: 'U-member', relationship_type: 'parent', ...overrides };
}

describe('canManageAppointments（嚴格判定）', () => {
  it('影子模式下的 MEMBER：my_permissions 說可寫，嚴格權限說不行，掛號照嚴格的', () => {
    const shadowMember = member({
      my_role: 'MEMBER',
      my_permissions: { general: ['READ', 'WRITE'], sensitive: ['READ'], private: ['READ'] },
      my_strict_permissions: { general: ['READ'], sensitive: [], private: [] },
    });

    expect(canManageAppointments(shadowMember)).toBe(false);
    // 用藥沒有收緊，仍然照 my_permissions
    expect(canManageMedications(shadowMember)).toBe(true);
  });

  it('受委任的 MEMBER：my_role 看不出來，嚴格權限有 GENERAL WRITE 就可以', () => {
    const delegated = member({
      my_role: 'MEMBER',
      my_permissions: { general: ['READ', 'WRITE'], sensitive: ['READ'], private: ['READ'] },
      my_strict_permissions: {
        general: ['READ', 'WRITE'],
        sensitive: ['READ', 'WRITE'],
        private: ['READ'],
      },
    });

    expect(canManageAppointments(delegated)).toBe(true);
  });

  it('後端沒帶嚴格權限時一律不行（fail-closed），不退回去看 my_permissions', () => {
    const legacyBackend = member({
      my_permissions: { general: ['READ', 'WRITE'], sensitive: [], private: [] },
    });

    expect(canManageAppointments(legacyBackend)).toBe(false);
  });
});

describe('canReadHealthRecords／canRecordHealthFor（嚴格判定）', () => {
  it('影子模式下的 MEMBER：my_permissions 說有 SENSITIVE 讀寫權，嚴格權限說沒有，健康紀錄照嚴格的回傳 false', () => {
    const shadowMember = member({
      my_role: 'MEMBER',
      my_permissions: { general: ['READ'], sensitive: ['READ', 'WRITE'], private: [] },
      my_strict_permissions: { general: ['READ'], sensitive: [], private: [] },
    });

    expect(canReadHealthRecords(shadowMember)).toBe(false);
    expect(canRecordHealthFor(shadowMember)).toBe(false);
  });

  it('嚴格權限有 SENSITIVE READ／WRITE 時各自放行', () => {
    const readOnly = member({
      my_strict_permissions: { general: [], sensitive: ['READ'], private: [] },
    });
    expect(canReadHealthRecords(readOnly)).toBe(true);
    expect(canRecordHealthFor(readOnly)).toBe(false);

    const readWrite = member({
      my_strict_permissions: { general: [], sensitive: ['READ', 'WRITE'], private: [] },
    });
    expect(canReadHealthRecords(readWrite)).toBe(true);
    expect(canRecordHealthFor(readWrite)).toBe(true);
  });

  it('受委任的 MEMBER：my_role 看不出來，嚴格權限有 SENSITIVE 就可以', () => {
    const delegated = member({
      my_role: 'MEMBER',
      my_permissions: { general: ['READ'], sensitive: ['READ'], private: [] },
      my_strict_permissions: { general: [], sensitive: ['READ', 'WRITE'], private: [] },
    });

    expect(canReadHealthRecords(delegated)).toBe(true);
    expect(canRecordHealthFor(delegated)).toBe(true);
  });

  it('後端沒帶嚴格權限時一律不行（fail-closed），不退回去看 my_permissions', () => {
    const legacyBackend = member({
      my_permissions: { general: [], sensitive: ['READ', 'WRITE'], private: [] },
    });

    expect(canReadHealthRecords(legacyBackend)).toBe(false);
    expect(canRecordHealthFor(legacyBackend)).toBe(false);
  });
});
