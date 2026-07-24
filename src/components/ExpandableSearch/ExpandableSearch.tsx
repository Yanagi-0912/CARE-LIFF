import { useRef, useState, type FormEvent } from 'react';
import { SearchIcon } from '../icons';
import './ExpandableSearch.css';

type ExpandableSearchProps = {
  placeholder: string;
  ariaLabel: string;
  onSubmitSearch?: (query: string) => void;
  className?: string;
  disabled?: boolean;
};

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
      className={`expand-search${className ? ` ${className}` : ''}${disabled ? ' is-disabled' : ''}`}
      onSubmit={handleSubmit}
      role="search"
      onClick={() => {
        if (!disabled) inputRef.current?.focus();
      }}
    >
      <span className="expand-search__icon" aria-hidden="true">
        <SearchIcon width={20} height={20} />
      </span>
      <input
        ref={inputRef}
        className="expand-search__input"
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
