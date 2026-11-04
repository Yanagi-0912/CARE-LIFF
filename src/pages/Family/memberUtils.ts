import { useParams } from 'react-router-dom';

import { useFamily } from '../../hooks/useFamily';
import type { FamilyMember } from '../../types/family';

export function memberName(member: FamilyMember): string {
  return member.display_name || member.user_id.slice(0, 8);
}

export function memberPath(member: FamilyMember, sub = ''): string {
  return `/family/members/${encodeURIComponent(member.user_id)}${sub}`;
}

/** 網址上的 :userId 對到族譜裡的那一位；族譜還沒回來或已不在名單時 member 為 undefined。 */
export function useFamilyMember() {
  const { userId } = useParams();
  const family = useFamily();
  const member = family.members.find((m) => m.user_id === userId);
  return { ...family, member };
}
