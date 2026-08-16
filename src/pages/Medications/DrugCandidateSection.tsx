import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from 'lucide-react';
import type { DrugCandidate, RecognizedDrug } from '../../types/prescription';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import { PillThumbnail } from './PillThumbnail';
import { formatAppearanceMarks, formatAppearancePrimary, formatAppearanceSize } from './appearanceText';
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
  const separator = t('meds.scan.draft.slotListSeparator');
  const primary = formatAppearancePrimary(candidate, separator);
  const marks = formatAppearanceMarks(candidate, separator);
  const size = formatAppearanceSize(candidate, separator);

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
        {/* 外觀尺寸沒有已知單位（見 appearanceText.ts 的說明），帶標籤呈現
            原始值，不臆測單位；獨立一行，不併進 primary 摘要。 */}
        {size && (
          <p className="text-xs text-muted-foreground">
            {t('meds.scan.draft.appearance.sizeLabel', { value: size })}
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
    // 這顆按鈕的語意是「可切換的單選項目」：再點一次已選的候選會取消選取
    // （見 DrugCandidateSection 的 onSelect 呼叫），這不符合 ARIA radio
    // 不能被再次點擊取消的規則，也沒有實作 radio 需要的方向鍵移焦——
    // 用原生 button 的預設角色搭配 aria-pressed 才是誠實的角色宣告。
    <button
      type="button"
      aria-pressed={selected}
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

  // C1 修正：候選是在「目前這個顏色／形狀篩選」之下才呈現出來的，使用者
  // 挑的也是那個當下看得到的某一張。一旦篩選的前提改變——換一個屬性值、
  // 重新篩選、或直接略過——原本挑的那張就不再是畫面上任何看得到的東西，
  // 選取狀態必須跟著清空，否則會出現「畫面說不提供照片，送出的卻是使用者
  // 已經放棄的篩選底下選出的證號」這種貼錯照片的情境。三個會改變篩選前提
  // 的操作（換屬性值、重新篩選、略過）一律經過這三支函式，統一在改變
  // filters／skipped 的同時呼叫 onSelect(null)，不讓任何一條路徑漏掉。
  const pickColor = (color: string) => {
    setFilters((f) => ({ ...f, color }));
    onSelect(null);
  };
  const pickShape = (shape: string) => {
    setFilters((f) => ({ ...f, shape }));
    onSelect(null);
  };
  const resetFilters = () => {
    setFilters({ color: null, shape: null });
    onSelect(null);
  };
  const skipNarrowing = () => {
    setSkipped(true);
    onSelect(null);
  };
  // I5：略過不是單行道——使用者可能是手滑點到，或想起自己其實看得出顏色／
  // 形狀，要留一條路回到收窄流程，而不是只能重新掃描整張藥袋。
  const returnToNarrowing = () => {
    setSkipped(false);
    setFilters({ color: null, shape: null });
    onSelect(null);
  };

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
        {/* I5：略過不是單行道，留一條路回到收窄流程。 */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 self-start"
          disabled={disabled}
          onClick={returnToNarrowing}
        >
          {t('meds.scan.draft.appearance.returnToNarrowing')}
        </Button>
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
          onPick={pickColor}
          onSkip={skipNarrowing}
          skipLabel={t('meds.scan.draft.appearance.skipNarrowing')}
          disabled={disabled}
        />
      )}

      {result.stage === 'ask-shape' && (
        <AttributeQuestion
          prompt={t('meds.scan.draft.appearance.askShape')}
          options={result.options}
          onPick={pickShape}
          onSkip={skipNarrowing}
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
            {/* 收窄到只剩 1 種可能時，「從這 1 種…選出」讀起來很怪，換一句
                措辭；仍然要求使用者按一下才算數，不因為只剩一種就自動選定
                （本能力全程「不臆測，問使用者」的同一個原則）。 */}
            {result.candidates.length === 1
              ? t('meds.scan.draft.appearance.pickPromptSingle')
              : t('meds.scan.draft.appearance.pickPrompt', { count: result.candidates.length })}
          </FieldDescription>
          {/* 這是「可切換的單選清單」，不是 ARIA 的 radio（radio 不允許
              再次點擊就取消選取）；用 data-testid 而非 role 讓測試能穩定
              框住這個清單，不冒用一個沒有完整實作鍵盤操作的角色。 */}
          <div data-testid="candidate-list" className="flex flex-col gap-2">
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
              onClick={resetFilters}
            >
              {t('meds.scan.draft.appearance.resetNarrowing')}
            </Button>
          )}
        </div>
      )}
    </FieldSet>
  );
}
