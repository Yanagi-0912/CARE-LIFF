import { useState, type FormEvent } from 'react';
import { SearchIcon } from '../icons';
import './ExpandableSearch.css';

type ExpandableSearchProps = {
  placeholder: string;
  ariaLabel: string;
  onSubmitSearch?: (query: string) => void;
  className?: string;
};

export default function ExpandableSearch({
  placeholder,
  ariaLabel,
  onSubmitSearch,
  className = '',
}: ExpandableSearchProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitSearch?.(query.trim());
  };

  return (
    <form
      className={`expand-search${className ? ` ${className}` : ''}`}
      onSubmit={handleSubmit}
      role="search"
    >
      <span className="expand-search__icon" aria-hidden="true">
        <SearchIcon width={20} height={20} />
      </span>
      <input
        className="expand-search__input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        enterKeyHint="search"
      />
    </form>
  );
}
