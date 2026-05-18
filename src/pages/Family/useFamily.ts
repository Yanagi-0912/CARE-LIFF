import { useState, useEffect, useCallback } from 'react';
import { fetchFamilyTree } from '../../api/familyApi';
import type { FamilyMember } from '../../types/family';

interface UseFamilyReturn {
  members: FamilyMember[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * 族譜資料 hook — 掛載時自動載入，並提供 refetch
 */
export function useFamily(): UseFamilyReturn {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFamilyTree();
      setMembers(res.family_tree.family_members);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入族譜失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { members, loading, error, refetch: load };
}
