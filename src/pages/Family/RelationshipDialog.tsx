import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { UserIcon } from 'lucide-react';

import { setRelationship } from '../../api/familyApi';
import type { FamilyMember, RelationshipType } from '../../types/family';
import {
  ASSIGNABLE_RELATIONSHIP_TYPES,
  RELATIONSHIP_LABEL_KEY,
  isRelationshipType,
} from '../../types/family';
import { queryKeys } from '@/lib/queryClient';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface Props {
  member: FamilyMember;
  onClose: () => void;
}

/**
 * 設定「我怎麼稱呼這位家人」。
 *
 * 這與家人權限是兩件事：稱謂只影響族譜呈現，不代表能看哪些健康資料。
 */
export function RelationshipDialog({ member, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const displayName = member.display_name || member.user_id.slice(0, 8);
  const current = isRelationshipType(member.relationship_type)
    ? member.relationship_type
    : null;
  const [selected, setSelected] = useState<RelationshipType | null>(current);

  const mutation = useMutation({
    mutationFn: (relationshipType: RelationshipType) =>
      setRelationship(member.user_id, relationshipType),
    onSuccess: async (_tree, relationshipType) => {
      queryClient.setQueryData<{
        members: FamilyMember[];
        roleAssignment: unknown;
      }>(queryKeys.familyTree, (old) =>
        old
          ? {
              ...old,
              members: old.members.map((item) =>
                item.user_id === member.user_id
                  ? { ...item, relationship_type: relationshipType }
                  : item,
              ),
            }
          : old,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.familyTree });
    },
  });

  const handleSave = async () => {
    if (!selected) return;
    try {
      await mutation.mutateAsync(selected);
      toast.success(t('familyRelationship.manage.saved', { name: displayName }));
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('familyRelationship.manage.saveError'),
      );
    }
  };

  const unchanged = selected === current;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent initialFocus={titleRef} className="max-h-[85dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {t('familyRelationship.manage.title')}
          </DialogTitle>
          <DialogDescription>
            {t('familyRelationship.manage.desc')}
          </DialogDescription>
        </DialogHeader>

        <Item variant="outline" className="flex-col items-stretch gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <ItemMedia>
              <Avatar className="size-12">
                <AvatarImage src={member.picture_url} alt="" />
                <AvatarFallback>
                  <UserIcon className="size-5" />
                </AvatarFallback>
              </Avatar>
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="text-base">{displayName}</ItemTitle>
              <p className="text-sm text-muted-foreground">
                {current
                  ? t(RELATIONSHIP_LABEL_KEY[current])
                  : t('familyRelationship.unset')}
              </p>
            </ItemContent>
            {mutation.isPending && <Spinner aria-hidden="true" />}
          </div>

          <p className="text-sm font-medium">
            {t('familyRelationship.manage.relationFor', {
              name: displayName,
            })}
          </p>

          <ToggleGroup
            variant="primary"
            className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2"
            value={selected ? [selected] : []}
            onValueChange={(next) => {
              const relationship = next[0] as RelationshipType | undefined;
              if (relationship) setSelected(relationship);
            }}
            aria-label={t('familyRelationship.manage.relationFor', {
              name: displayName,
            })}
          >
            {ASSIGNABLE_RELATIONSHIP_TYPES.map((relationship) => (
              <ToggleGroupItem
                key={relationship}
                value={relationship}
                disabled={mutation.isPending}
                className="h-auto min-h-11 whitespace-normal py-2"
              >
                {t(RELATIONSHIP_LABEL_KEY[relationship])}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Item>

        <div className="grid gap-2 sm:grid-cols-2">
          <DialogClose
            render={
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                className="h-auto min-h-11 py-2 whitespace-normal sm:order-1"
              />
            }
          >
            {t('familyPermission.cancel')}
          </DialogClose>
          <Button
            type="button"
            disabled={!selected || unchanged || mutation.isPending}
            onClick={() => void handleSave()}
            className="h-auto min-h-11 py-2 whitespace-normal sm:order-2"
          >
            {mutation.isPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {mutation.isPending
              ? t('familyRelationship.manage.saving')
              : t('familyPermission.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
