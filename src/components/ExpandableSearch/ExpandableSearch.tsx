import { useState, type FormEvent } from 'react';
import { SearchIcon } from '../icons';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

type ExpandableSearchProps = {
  placeholder: string;
  ariaLabel: string;
  onSubmitSearch?: (query: string) => void;
  className?: string;
  disabled?: boolean;
};

// 收合 56px = 圖示 20px + 左右各 18px 內距，三者必須一起改。
// 這裡刻意用 px 而非 rem：改用 rem 會隨設定頁字級（16/20/24px）放大容器，
// 但圖示是固定 20px，放大後會與內距對不齊。
const COLLAPSED = 'w-[56px] h-[56px] px-[18px]';
const EXPANDED = 'focus-within:w-[min(100%,230px)]';

export default function ExpandableSearch({
  placeholder,
  ariaLabel,
  onSubmitSearch,
  className = '',
  disabled = false,
}: ExpandableSearchProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    onSubmitSearch?.(query.trim());
  };

  return (
    <form onSubmit={handleSubmit} role="search">
      {/* InputGroup 承載外觀與展開動畫；InputGroupAddon 內建「點擊聚焦輸入框」，
          原本要自己拿 ref 再在 form 上掛 onClick 才做得到。 */}
      <InputGroup
        className={cn(
          'group max-w-full overflow-hidden rounded-full border-0 bg-white/95',
          'transition-[width] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          COLLAPSED,
          EXPANDED,
          disabled && 'cursor-wait opacity-70',
          className,
        )}
      >
        <InputGroupAddon className="p-0 text-[var(--primary-strong)]">
          <SearchIcon width={20} height={20} />
        </InputGroupAddon>
        <InputGroupInput
          // 收合時把文字與游標透明化（僅剩圖示），展開才顯示
          className={cn(
            'ml-2.5 text-[0.95rem] font-[650]',
            'text-transparent caret-transparent placeholder:text-transparent',
            'group-focus-within:text-[var(--primary-strong)] group-focus-within:caret-auto',
            'group-focus-within:placeholder:text-[var(--muted)]',
          )}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          enterKeyHint="search"
          disabled={disabled}
        />
      </InputGroup>
    </form>
  );
}
