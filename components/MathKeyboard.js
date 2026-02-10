import { useState } from 'react';

/**
 * MathKeyboard - A reusable component for inserting mathematical symbols into text fields
 * 
 * Usage:
 * <MathKeyboard onInsert={(symbol) => insertAtCursor(symbol)} />
 */

const MATH_SYMBOLS = [
  // Basic operations
  { symbol: '×', label: '×', category: 'basic' },
  { symbol: '÷', label: '÷', category: 'basic' },
  { symbol: '±', label: '±', category: 'basic' },
  { symbol: '∓', label: '∓', category: 'basic' },
  
  // Fractions & powers
  { symbol: '½', label: '½', category: 'fraction' },
  { symbol: '⅓', label: '⅓', category: 'fraction' },
  { symbol: '¼', label: '¼', category: 'fraction' },
  { symbol: '¾', label: '¾', category: 'fraction' },
  { symbol: '²', label: '²', category: 'power' },
  { symbol: '³', label: '³', category: 'power' },
  { symbol: 'ⁿ', label: 'ⁿ', category: 'power' },
  
  // Greek letters
  { symbol: 'α', label: 'α', category: 'greek' },
  { symbol: 'β', label: 'β', category: 'greek' },
  { symbol: 'γ', label: 'γ', category: 'greek' },
  { symbol: 'δ', label: 'δ', category: 'greek' },
  { symbol: 'π', label: 'π', category: 'greek' },
  { symbol: 'θ', label: 'θ', category: 'greek' },
  { symbol: 'λ', label: 'λ', category: 'greek' },
  { symbol: 'μ', label: 'μ', category: 'greek' },
  { symbol: 'σ', label: 'σ', category: 'greek' },
  { symbol: 'φ', label: 'φ', category: 'greek' },
  { symbol: 'ω', label: 'ω', category: 'greek' },
  { symbol: 'Δ', label: 'Δ', category: 'greek' },
  { symbol: 'Σ', label: 'Σ', category: 'greek' },
  { symbol: 'Π', label: 'Π', category: 'greek' },
  
  // Relations
  { symbol: '≈', label: '≈', category: 'relation' },
  { symbol: '≠', label: '≠', category: 'relation' },
  { symbol: '≤', label: '≤', category: 'relation' },
  { symbol: '≥', label: '≥', category: 'relation' },
  { symbol: '∈', label: '∈', category: 'relation' },
  { symbol: '∉', label: '∉', category: 'relation' },
  { symbol: '⊂', label: '⊂', category: 'relation' },
  { symbol: '⊃', label: '⊃', category: 'relation' },
  { symbol: '∝', label: '∝', category: 'relation' },
  
  // Special
  { symbol: '∞', label: '∞', category: 'special' },
  { symbol: '√', label: '√', category: 'special' },
  { symbol: '∛', label: '∛', category: 'special' },
  { symbol: '∜', label: '∜', category: 'special' },
  { symbol: '∫', label: '∫', category: 'special' },
  { symbol: '∑', label: '∑', category: 'special' },
  { symbol: '∏', label: '∏', category: 'special' },
  { symbol: '∂', label: '∂', category: 'special' },
  { symbol: '°', label: '°', category: 'special' },
  { symbol: '′', label: '′', category: 'special' },
  { symbol: '″', label: '″', category: 'special' },
  
  // Arrows
  { symbol: '→', label: '→', category: 'arrow' },
  { symbol: '←', label: '←', category: 'arrow' },
  { symbol: '↔', label: '↔', category: 'arrow' },
  { symbol: '⇒', label: '⇒', category: 'arrow' },
  { symbol: '⇐', label: '⇐', category: 'arrow' },
  { symbol: '⇔', label: '⇔', category: 'arrow' },
];

const CATEGORIES = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'basic', label: 'Podstawowe' },
  { key: 'fraction', label: 'Ułamki' },
  { key: 'power', label: 'Potęgi' },
  { key: 'greek', label: 'Greckie' },
  { key: 'relation', label: 'Relacje' },
  { key: 'special', label: 'Specjalne' },
  { key: 'arrow', label: 'Strzałki' },
];

export default function MathKeyboard({ onInsert, compact = false }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isOpen, setIsOpen] = useState(!compact);

  const filteredSymbols = selectedCategory === 'all' 
    ? MATH_SYMBOLS 
    : MATH_SYMBOLS.filter(s => s.category === selectedCategory);

  const handleSymbolClick = (symbol) => {
    if (onInsert) {
      onInsert(symbol);
    }
  };

  if (compact && !isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
      >
        <span>π</span>
        <span>Symbole matematyczne</span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">Symbole matematyczne</h4>
        {compact && (
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="Zamknij klawiaturę"
          >
            ×
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 mb-3">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setSelectedCategory(cat.key)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              selectedCategory === cat.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Symbol grid */}
      <div className="grid grid-cols-8 gap-1">
        {filteredSymbols.map((item, idx) => (
          <button
            key={`${item.symbol}-${idx}`}
            type="button"
            onClick={() => handleSymbolClick(item.symbol)}
            className="flex h-9 w-9 items-center justify-center rounded border border-gray-200 bg-white text-lg font-medium text-gray-800 hover:bg-indigo-50 hover:border-indigo-300 active:bg-indigo-100 transition-colors"
            title={`Wstaw ${item.label}`}
          >
            {item.symbol}
          </button>
        ))}
      </div>

      {filteredSymbols.length === 0 && (
        <p className="text-center text-sm text-gray-500 py-4">Brak symboli w tej kategorii</p>
      )}
    </div>
  );
}
