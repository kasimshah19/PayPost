import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

/**
 * Accessible dropdown menu triggered by kebab "⋯" or custom trigger.
 */
export function Menu({ items = [], label = 'More options', trigger }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleOutsideClick);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {trigger ? (
        <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-label={label}
          className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <Icon name="kebab" className="w-5 h-5" />
        </button>
      )}

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-48 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none py-1 border border-gray-100 animate-in fade-in zoom-in-95 duration-100"
        >
          {items.map((item, index) => {
            if (item.hidden) return null;
            return (
              <button
                key={index}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setIsOpen(false);
                  if (item.onClick) item.onClick();
                }}
                className={`w-full min-h-11 px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                  item.danger
                    ? 'text-red-600 hover:bg-red-50 active:bg-red-100'
                    : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {item.icon && <Icon name={item.icon} className="w-4 h-4" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
