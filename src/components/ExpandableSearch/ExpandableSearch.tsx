import { useRef, useState, type FormEvent } from 'react';
import { SearchIcon } from '../icons';
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    onSubmitSearch?.(query.trim());
  };

  return (
    <form
      className={cn(
        'group relative z-[1] box-border flex max-w-full items-center overflow-hidden rounded-full border-0 bg-white/95',
        'transition-[width] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        COLLAPSED,
        EXPANDED,
        disabled && 'cursor-wait opacity-70',
        className,
      )}
      onSubmit={handleSubmit}
      role="search"
      onClick={() => {
        if (!disabled) inputRef.current?.focus();
      }}
    >
      <span
        className="pointer-events-none inline-flex size-5 shrink-0 items-center justify-center text-[#0b6b60]"
        aria-hidden="true"
      >
        <SearchIcon width={20} height={20} />
      </span>
      <input
        ref={inputRef}
        // 收合時把文字與游標透明化（僅剩圖示），展開才顯示 —— 原本以
        // .expand-search:not(:focus-within) 表達，這裡改用 group 變體。
        className={cn(
          'ml-2.5 w-full min-w-0 flex-1 border-0 bg-transparent text-[0.95rem] font-[650] outline-none',
          'text-transparent caret-transparent placeholder:text-transparent',
          // 完整寫出，不可用模板字串組合：Tailwind 掃描原始碼文字比對 class，
          // 拼接出來的字串不會出現在檔案中，規則就不會被產生。
          'group-focus-within:text-[#0b6b60] group-focus-within:caret-auto',
          'group-focus-within:placeholder:text-[rgba(11,107,96,0.55)]',
        )}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        enterKeyHint="search"
        disabled={disabled}
      />
    </form>
  );
}
