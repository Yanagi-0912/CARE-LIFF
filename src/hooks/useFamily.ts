import { useQuery } from '@tanstack/react-query';
import { fetchFamilyTree } from '../api/familyApi';
import { queryKeys } from '@/lib/queryClient';
import type {
  FamilyMember,
  FamilyRoleAssignmentStatus,
} from '../types/family';

interface UseFamilyReturn {
  members: FamilyMember[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /**
   * 我自己的引導式角色指派狀態。
   *
   * 跟著族譜一起回，不另外打一支——族譜頁一載入就要知道「還有幾位沒設定」，
   * 多一次往返在長輩的行動網路上是看得見的。
   *
   * 由**後端**依族譜資料判定，前端不得以本地旗標代替：本地旗標會被清掉、
   * 在另一支裝置上不同步、也可能在使用者按了「完成」卻沒設定任何人時被設起來。
   */
  roleAssignment: FamilyRoleAssignmentStatus | null;
}

/**
 * 族譜資料 hook — 掛載時自動載入，並提供 refetch。
 *
 * 對外介面沿用原本的 { members, loading, error, refetch }，
 * 呼叫端（Family 頁、Medications 的對象清單）不需改動。
 */
export function useFamily(): UseFamilyReturn {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.familyTree,
    queryFn: async () => {
      const res = await fetchFamilyTree();
      return {
        members: res.family_tree.family_members,
        roleAssignment: res.role_assignment ?? null,
      };
    },
  });

  return {
    members: data?.members ?? [],
    roleAssignment: data?.roleAssignment ?? null,
    loading: isPending,
    error: error ? (error instanceof Error ? error.message : '載入族譜失敗') : null,
    refetch,
  };
}
