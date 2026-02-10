import { useRef, useState } from 'react';
import MathKeyboard from './MathKeyboard';

/**
 * MathInput - Single-line input with integrated mathematical keyboard
 * 
 * Props:
 * - value: current value
 * - onChange: change handler
 * - placeholder: placeholder text
 * - label: optional label text
 * - type: input type (default 'text')
 */
export default function MathInput({
  value = '',
  onChange,
  placeholder = '',
  label = '',
  type = 'text',
  className = '',
}) {
  const inputRef = useRef(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const insertAtCursor = (symbol) => {
    const input = inputRef.current;
    if (!input) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = value || '';
    
    const newText = text.substring(0, start) + symbol + text.substring(end);
    
    // Call onChange with new value
    if (onChange) {
      onChange({ target: { value: newText } });
    }

    // Set cursor position after inserted symbol
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + symbol.length, start + symbol.length);
    }, 0);
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          
          <button
            type="button"
            onClick={() => setKeyboardVisible(!keyboardVisible)}
            className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border transition-colors ${
              keyboardVisible
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title={keyboardVisible ? 'Ukryj symbole' : 'Pokaż symbole'}
          >
            <span className="text-lg">π</span>
          </button>
        </div>

        {keyboardVisible && (
          <MathKeyboard onInsert={insertAtCursor} />
        )}
      </div>
    </div>
  );
}
