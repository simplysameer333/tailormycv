"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { FiX } from "react-icons/fi";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Async function that returns suggestions for the current query */
  fetchSuggestions: (query: string) => Promise<string[]>;
  placeholder?: string;
  /** When true, only one tag is allowed at a time */
  single?: boolean;
  className?: string;
}

export default function TagInput({
  value,
  onChange,
  fetchSuggestions,
  placeholder = "Type to search…",
  single = false,
  className = "",
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchDebounced = useCallback(
    (q: string) => {
      clearTimeout(debounceRef.current);
      if (!q.trim()) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await fetchSuggestions(q);
          const filtered = results.filter((r) => !value.includes(r));
          setSuggestions(filtered);
          setOpen(filtered.length > 0);
          setActiveIdx(-1);
        } catch {
          setSuggestions([]);
        }
      }, 220);
    },
    [fetchSuggestions, value]
  );

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setInput("");
      setOpen(false);
      return;
    }
    onChange(single ? [trimmed] : [...value, trimmed]);
    setInput("");
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        addTag(suggestions[activeIdx]);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showInput = !single || value.length === 0;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Tag area */}
      <div
        className="flex flex-wrap gap-1.5 min-h-[42px] max-h-[80px] overflow-y-auto w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 transition cursor-text focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100"
        onClick={() => showInput && inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-brand-100 text-brand-800 text-xs font-semibold px-2.5 py-1 shrink-0"
          >
            {tag}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="text-brand-500 hover:text-brand-800 transition ml-0.5"
              aria-label={`Remove ${tag}`}
            >
              <FiX className="w-3 h-3" />
            </button>
          </span>
        ))}

        {showInput && (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); fetchDebounced(e.target.value); }}
            onKeyDown={handleKeyDown}
            onFocus={() => input && suggestions.length > 0 && setOpen(true)}
            className="flex-1 min-w-[40px] text-sm outline-none bg-transparent placeholder:text-slate-400 py-0.5"
            placeholder={value.length === 0 ? placeholder : ""}
          />
        )}

        {/* "Change" link when single and a tag is selected */}
        {single && value.length > 0 && (
          <button
            type="button"
            onClick={() => { onChange([]); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="text-xs text-slate-400 hover:text-brand-600 transition ml-auto self-center"
          >
            Change
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1">
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
              className={`w-full text-left px-3 py-1.5 text-sm transition ${
                i === activeIdx
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
