import { useState } from 'preact/hooks';

interface SearchBarProps {
    onSearch: (query: string) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
    const [query, setQuery] = useState('');

    const handleInput = (e: Event) => {
        const value = (e.target as HTMLInputElement).value;
        setQuery(value);
        if (value.length >= 3) {
            onSearch(value);
        }
    };

    return (
        <div class="memory-search-bar">
            <input
                type="text"
                class="memory-search-input"
                placeholder="Search..."
                value={query}
                onInput={handleInput}
            />
            <svg
                class="memory-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
            </svg>
        </div>
    );
}
