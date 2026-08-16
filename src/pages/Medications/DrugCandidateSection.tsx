import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from 'lucide-react';
import type { DrugCandidate, RecognizedDrug } from '../../types/prescription';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import { PillThumbnail } from './PillThumbnail';
import { formatAppearanceMarks, formatAppearancePrimary } from './appearanceText';
import {
  narrowCandidates,
  type CandidateNarrowingFilters,
} from './candidateNarrowing';

interface DrugCandidateSectionProps {
  drug: RecognizedDrug;
  /** 藥名是否已被使用者改成與辨識結果不同的字串（見 PrescriptionDraftForm）。
   * 名稱一經編輯，證號與照片一併失效，這裡整段外觀資訊都不再呈現。 */
  nameEdited: boolean;
  selectedLicense: string | null;
  onSelect: (license: string | null) => void;
  disabled?: boolean;
}

/** 候選卡片：縮圖＋中文品名＋外觀摘要＋刻痕/標註。
 *  readOnly 用於「唯一候選，證號已確定」的情境——沒有東西可挑，純呈現。 */
function CandidateCard({
  candidate,
  selected,
  onSelect,
  readOnly,
  disabled,
}: {
  candidate: DrugCandidate;
  selected: boolean;
  onSelect?: () => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const primary = formatAppearancePrimary(candidate);
  const marks = formatAppearanceMarks(candidate);

  const body = (
    <>
      <PillThumbnail src={candidate.thumbnail_url} alt={candidate.name_zh} className="size-20" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{candidate.name_zh}</p>
        {primary && <p className="text-sm text-muted-foreground">{primary}</p>}
        {marks && (
          <p className="text-xs text-muted-foreground">
            {t('meds.scan.draft.appearance.marksLabel', { text: marks })}
          </p>
        )}
      </div>
      {readOnly ? (
        <Badge className="shrink-0 bg-primary/10 text-primary">
          {t('meds.scan.draft.appearance.confirmedBadge')}
        </Badge>
      ) : (
        selected && <CheckIcon className="size-5 shrink-0 text-primary" aria-hidden />
      )}
    </>
  );

  if (readOnly) {
    return <div className="flex items-center gap-3 rounded-xl p-2">{body}</div>;
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors',
        selected ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border',
      )}
    >
      {body}
    </button>
  );
}

/** 顏色／形狀的單一屬性詢問：一排大按鈕，任一都能立刻收窄一次，另外提供「略過」逃生口。 */
function AttributeQuestion({
  prompt,
  options,
  onPick,
  onSkip,
  skipLabel,
  disabled,
}: {
  prompt: string;
  options: string[];
  onPick: (value: string) => void;
  onSkip: () => void;
  skipLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FieldDescription>{prompt}</FieldDescription>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            variant="outline"
            size="lg"
            disabled={disabled}
            onClick={() => onPick(option)}
          >
            {option}
          </Button>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" className="self-start" disabled={disabled} onClick={onSkip}>
        {skipLabel}
      </Button>
    </div>
  );
}

export function DrugCandidateSection({
  drug,
  nameEdited,
  selectedLicense,
  onSelect,
  disabled,
}: DrugCandidateSectionProps) {
  const { t } = useTranslation();
  // 收窄用的顏色／形狀篩選，加上使用者主動略過的旗標——三者都只是「這次
  // 呈現要怎麼問」的暫時狀態，不影響送出的證號（不挑選本來就不阻擋提交）。
  const [filters, setFilters] = useState<CandidateNarrowingFilters>({ color: null, shape: null });
  const [skipped, setSkipped] = useState(false);

  // 產品規則（spec「藥名被編輯時證號與照片一併失效」）：藥名一改，這整段
  // 都不該再呈現，避免使用者看到的照片其實對應著改名前的舊藥名。
  if (nameEdited) {
    return (
      <FieldDescription className="mt-3">
        {t('meds.scan.draft.appearance.nameEditedNote')}
      </FieldDescription>
    );
  }

  const candidates = drug.candidates;
  // 沒有候選＝這個藥名完全比不到藥證庫，本來就沒有任何外觀資料可呈現。
  if (candidates.length === 0) return null;

  if (candidates.length === 1) {
    return (
      <FieldSet className="mt-3">
        <FieldLegend variant="label">{t('meds.scan.draft.appearance.sectionTitle')}</FieldLegend>
        <CandidateCard candidate={candidates[0]} selected readOnly />
      </FieldSet>
    );
  }

  if (skipped) {
    return (
      <FieldSet className="mt-3">
        <FieldLegend variant="label">{t('meds.scan.draft.appearance.sectionTitle')}</FieldLegend>
        <FieldDescription>{t('meds.scan.draft.appearance.tooManyNote')}</FieldDescription>
      </FieldSet>
    );
  }

  const result = narrowCandidates(candidates, filters);

  return (
    <FieldSet className="mt-3">
      <FieldLegend variant="label">{t('meds.scan.draft.appearance.sectionTitle')}</FieldLegend>

      {result.stage === 'ask-color' && (
        <AttributeQuestion
          prompt={t('meds.scan.draft.appearance.askColor', { count: candidates.length })}
          options={result.options}
          onPick={(color) => setFilters((f) => ({ ...f, color }))}
          onSkip={() => setSkipped(true)}
          skipLabel={t('meds.scan.draft.appearance.skipNarrowing')}
          disabled={disabled}
        />
      )}

      {result.stage === 'ask-shape' && (
        <AttributeQuestion
          prompt={t('meds.scan.draft.appearance.askShape')}
          options={result.options}
          onPick={(shape) => setFilters((f) => ({ ...f, shape }))}
          onSkip={() => setSkipped(true)}
          skipLabel={t('meds.scan.draft.appearance.skipNarrowing')}
          disabled={disabled}
        />
      )}

      {result.stage === 'too-many' && (
        <FieldDescription>{t('meds.scan.draft.appearance.tooManyNote')}</FieldDescription>
      )}

      {result.stage === 'pick' && (
        <div className="flex flex-col gap-3">
          <FieldDescription>
            {t('meds.scan.draft.appearance.pickPrompt', { count: result.candidates.length })}
          </FieldDescription>
          <div role="radiogroup" aria-label={t('meds.scan.draft.appearance.sectionTitle')} className="flex flex-col gap-2">
            {result.candidates.map((candidate) => (
              <CandidateCard
                key={candidate.license_number}
                candidate={candidate}
                selected={selectedLicense === candidate.license_number}
                disabled={disabled}
                onSelect={() =>
                  onSelect(selectedLicense === candidate.license_number ? null : candidate.license_number)
                }
              />
            ))}
          </div>
          {/* 未挑選不得阻擋提交，這裡明講後果只是「不會顯示藥丸照片」，
              不是任何功能受限（spec「使用者為多候選藥品挑定藥證」）。 */}
          <FieldDescription>{t('meds.scan.draft.appearance.notPickedHint')}</FieldDescription>
          {(filters.color || filters.shape) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={disabled}
              onClick={() => setFilters({ color: null, shape: null })}
            >
              {t('meds.scan.draft.appearance.resetNarrowing')}
            </Button>
          )}
        </div>
      )}
    </FieldSet>
  );
}
