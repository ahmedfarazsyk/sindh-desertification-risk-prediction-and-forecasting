'use client'

import { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
  onSelect: (name: string) => void;
}

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch Autocomplete Suggestions
  useEffect(() => {
    const fetchDistricts = async () => {
      if (query.length > 2) {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search?q=${query}`);
          const data = await res.json();
          setResults(data);
          setIsOpen(true);
        } catch (error) {
          console.error("Search failed", error);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    };
    
    const debounce = setTimeout(fetchDistricts, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  // Close dropdown if clicking outside the component
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  // NEW: Handle pressing "Enter"
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    // If there are results, default to the top result to ensure a perfect match. 
    // Otherwise, just send what the user typed.
    const searchTarget = results.length > 0 ? results[0] : query;
    
    onSelect(searchTarget);
    setIsOpen(false);
    setQuery(searchTarget);
  };

  return (
    <div ref={wrapperRef} className="relative w-[300px] md:w-[350px] shadow-xl rounded-full">
      {/* Wrapped in a form to natively support the 'Enter' key */}
      <form onSubmit={handleSubmit} className="relative">
        <button 
          type="submit" 
          className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400 hover:text-blue-600 transition-colors"
          title="Search"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
        </button>
        <input 
          type="text" 
          value={query}
          className="w-full pl-11 pr-4 py-3 bg-white rounded-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
          placeholder="Search pre-computed districts..."
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if(results.length > 0) setIsOpen(true); }}
        />
      </form>
      
      {/* Autocomplete Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 w-full bg-white mt-2 rounded-xl shadow-2xl overflow-hidden border border-slate-100 divide-y divide-slate-100">
          {results.map(name => (
            <button 
              key={name}
              type="button" // Explicitly setting type="button" prevents accidental form submission
              onClick={() => { 
                onSelect(name); 
                setIsOpen(false);
                setQuery(name);
              }}
              className="w-full text-left px-5 py-3 hover:bg-blue-50 text-slate-700 font-medium transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}