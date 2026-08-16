import { useTranslation } from 'react-i18next';
import { PlusIcon, XIcon } from 'lucide-react';

import { CHRONIC_OPTIONS } from './healthForm';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldLabel,
    FieldLegend,
    FieldSet,
    FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface ChronicDiseaseFieldProps {
    /** 已勾選的固定選項 */
    selected: string[];
    onToggle: (value: string) => void;
    /** 使用者自己打的病名，各自一筆 */
    custom: string[];
    onRemoveCustom: (name: string) => void;
    /** 輸入框裡還沒新增的字。由頁面持有，送出時才能自動補加 */
    draft: string;
    onDraftChange: (value: string) => void;
    onAddCustom: () => void;
}

/**
 * 慢性病複選區。
 * 卡片外觀用 Field 的 has-data-checked: 變體，不用自己維護選中樣式。
 *
 * 自訂病名不走勾選卡片，而是「輸入 → 新增 → 變成一張可刪的標籤」：
 * 每一筆各自獨立、各自可刪
 */
export function ChronicDiseaseField({
    selected,
    onToggle,
    custom,
    onRemoveCustom,
    draft,
    onDraftChange,
    onAddCustom,
}: ChronicDiseaseFieldProps) {
    const { t } = useTranslation();

    // 固定選項翻成目前語系，自訂病名原文照用。
    // 以 CHRONIC_OPTIONS 為序而非勾選順序，摘要的排列才跟上面的卡片一致
    const summary = [
        ...CHRONIC_OPTIONS.filter((option) => selected.includes(option.value)).map((option) =>
            t(option.labelKey),
        ),
        ...custom,
    ].join(t('personalHealth.listSeparator'));

    return (
        <FieldSet>
            <FieldLegend variant="label" className="text-base font-bold">
                {t('personalHealth.chronic')}
            </FieldLegend>

            <div className="grid gap-2 sm:grid-cols-2">
                {CHRONIC_OPTIONS.map((option) => {
                    const id = `chronic-${option.value}`;
                    return (
                        <FieldLabel key={option.value} htmlFor={id}>
                            <Field orientation="horizontal">
                                <Checkbox
                                    id={id}
                                    checked={selected.includes(option.value)}
                                    onCheckedChange={() => onToggle(option.value)}
                                />
                                <FieldTitle className="text-base font-normal">
                                    {t(option.labelKey)}
                                </FieldTitle>
                            </Field>
                        </FieldLabel>
                    );
                })}
            </div>

            {/* 自訂區永遠顯示，不必先勾一個「其他」才看得到輸入框——
                少一次點擊，也少一個要理解的概念 */}
            <FieldLegend variant="label" className="mt-2 text-base font-bold">
                {t('personalHealth.chronicOtherTitle')}
            </FieldLegend>

            <Field orientation="vertical" className="gap-3">
                <FieldContent>
                    <Input
                        id="chronicDiseaseOther"
                        name="chronicDiseaseOther"
                        value={draft}
                        onChange={(event) => onDraftChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            onAddCustom();
                        }}
                        placeholder={t('personalHealth.chronicOtherPlaceholder')}
                    />
                </FieldContent>
                {/* 新增其他自行輸入的疾病的按鈕*/}
                <Button
                    type="button"
                    variant="outline"
                    onClick={onAddCustom}
                    disabled={!draft.trim()}
                >
                    <PlusIcon data-icon="inline-start" />
                    {t('personalHealth.chronicOtherAdd')}
                </Button>
            </Field>

            {custom.length > 0 && (
                <ul
                    className="flex flex-wrap gap-2"
                    aria-label={t('personalHealth.chronicOtherTitle')}
                >
                    {custom.map((name) => (
                        <li key={name}>
                            {/* 自行輸入疾病的Badge*/}
                            <Badge
                                variant="secondary"
                                className="h-auto min-h-11 gap-2 py-1 pr-1 pl-4 text-base"
                            >
                                {name}
                                {/* 刪除按鈕*/}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className="bg-background/70 hover:bg-background"
                                    aria-label={t('personalHealth.chronicOtherRemove', { name })}
                                    onClick={() => onRemoveCustom(name)}
                                >
                                    <XIcon className="size-5" />
                                </Button>
                            </Badge>
                        </li>
                    ))}
                </ul>
            )}

            {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        </FieldSet>
    );
}
