import { useQuery } from '@tanstack/react-query';
import { fetchFamilyTree } from '../api/familyApi';
import { queryKeys } from '@/lib/queryClient';
import type { FamilyMember } from '../types/family';

interface UseFamilyReturn {
  members: FamilyMember[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
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
      return res.family_tree.family_members;
    },
  });

  return {
    members: data ?? [],
    loading: isPending,
    error: error ? (error instanceof Error ? error.message : '載入族譜失敗') : null,
    refetch,
  };
}
