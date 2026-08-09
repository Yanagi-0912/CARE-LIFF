import type { ReactNode } from 'react';
import type { FieldError as RHFFieldError, UseFormRegisterReturn } from 'react-hook-form';

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import * as S from './styles';

/**
 * 這一頁的欄位外殼。
 *
 * 原本每個欄位都手寫 label + control + 錯誤 <span>，重複八次；
 * 錯誤訊息也只是視覺上的紅字，沒有和欄位建立關聯（螢幕閱讀器唸完
 * 標籤後不會提到錯在哪）。改用 Field 之後 aria-describedby 與
 * aria-invalid 由元件自動接線。
 *
 * orientation="horizontal" 對應原本「標籤在左、控制項在右」。
 * 不用 responsive：那個變體靠 @md/field-group 容器查詢，需要外層 FieldGroup；
 * 這裡的窄螢幕換行沿用 FORM_GROUP 既有的 max-[600px] 斷點即可。
 */
type HealthFieldProps = {
    /** 對應 control 的 id，Field 會用它接 label */
    htmlFor?: string;
    label: string;
    /** 欄位下方的補充說明（例如可接受範圍） */
    hint?: ReactNode;
    error?: RHFFieldError;
    children: ReactNode;
};

export function HealthField({ htmlFor, label, hint, error, children }: HealthFieldProps) {
    return (
        <Field orientation="horizontal" className={S.FORM_GROUP} data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={htmlFor} className={S.LABEL}>
                {label}
            </FieldLabel>
            <FieldContent className={S.FIELD_CONTROL}>
                {children}
                {hint && <FieldDescription>{hint}</FieldDescription>}
                <FieldError errors={error ? [error] : undefined} />
            </FieldContent>
        </Field>
    );
}

/** 文字／數字輸入。register 直接展開，維持與 react-hook-form 的連動 */
type HealthInputProps = {
    id: string;
    type?: 'text' | 'number';
    placeholder?: string;
    invalid?: boolean;
    register: UseFormRegisterReturn;
} & Pick<React.ComponentProps<'input'>, 'min' | 'max' | 'step'>;

export function HealthInput({ id, type = 'text', placeholder, invalid, register, ...rest }: HealthInputProps) {
    return (
        <input
            id={id}
            type={type}
            placeholder={placeholder}
            aria-invalid={invalid || undefined}
            className={cn(S.INPUT, invalid && S.INPUT_ERROR)}
            {...rest}
            {...register}
        />
    );
}

/** 多行輸入（重大疾病、手術紀錄） */
export function HealthTextarea({
    id,
    placeholder,
    register,
}: {
    id: string;
    placeholder?: string;
    register: UseFormRegisterReturn;
}) {
    return (
        <textarea
            id={id}
            rows={2}
            placeholder={placeholder}
            className={cn(S.INPUT, S.INPUT_LONG)}
            {...register}
        />
    );
}
