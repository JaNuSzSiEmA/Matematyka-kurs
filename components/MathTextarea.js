import { useRef, useState } from 'react';
import MathKeyboard from './MathKeyboard';

/**
 * MathTextarea - Textarea with integrated mathematical keyboard
 * 
 * Props:
 * - value: current value
 * - onChange: change handler
 * - placeholder: placeholder text
 * - rows: number of rows (default 4)
 * - label: optional label text
 * - showKeyboard: whether to show keyboard by default (default false)
 */
export default function MathTextarea({
  value = '',
  onChange,
  placeholder = '',
  rows = 4,
  label = '',
  showKeyboard = false,
  className = '',
}) {
  const textareaRef = useRef(null);
  const [keyboardVisible, setKeyboardVisible] = useState(showKeyboard);

  const insertAtCursor = (symbol) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = value || '';
    
    const newText = text.substring(0, start) + symbol + text.substring(end);
    
    // Call onChange with new value
    if (onChange) {
      onChange({ target: { value: newText } });
    }

    // Set cursor position after inserted symbol
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + symbol.length, start + symbol.length);
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
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={rows}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        
        <div className="flex items-center gap-2">
          {!keyboardVisible && (
            <button
              type="button"
              onClick={() => setKeyboardVisible(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <span className="text-base">π</span>
              <span>Pokaż symbole</span>
            </button>
          )}
          
          {keyboardVisible && (
            <button
              type="button"
              onClick={() => setKeyboardVisible(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span>Ukryj symbole</span>
            </button>
          )}
        </div>

        {keyboardVisible && (
          <MathKeyboard onInsert={insertAtCursor} />
        )}
      </div>
    </div>
  );
}
