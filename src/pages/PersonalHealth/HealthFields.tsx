import type { ReactNode } from 'react';
import type { FieldError as RHFFieldError, UseFormRegisterReturn } from 'react-hook-form';

import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/**
 * 這一頁的欄位外殼。
 *
 * 錯誤訊息的 aria-describedby / aria-invalid 由 Field 自動接線，
 * 不用每個欄位自己手寫紅字 <span>。
 *
 * orientation="responsive"：窄螢幕標籤在上、控制項在下（LIFF 幾乎都是手機，
 * 這是主要情形），容器寬到 @md 才變成標籤在左。斷點來自 FieldGroup 的
 * @container/field-group，所以每個 Step 的欄位都要包在 FieldGroup 裡。
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
        <Field orientation="responsive" data-invalid={error ? true : undefined}>
            {/* responsive 變體在 @md 會把標籤設成 flex-auto，配 max-w 收成固定欄寬 */}
            <FieldLabel htmlFor={htmlFor} className="text-base font-bold @md/field-group:max-w-40">
                {label}
            </FieldLabel>
            <FieldContent>
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
        <Input
            id={id}
            type={type}
            placeholder={placeholder}
            aria-invalid={invalid || undefined}
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
    return <Textarea id={id} rows={2} placeholder={placeholder} {...register} />;
}
