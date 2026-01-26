import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

// Fix for framer-motion type issues
const MotionDiv = motion.div as any;

export interface SelectOption {
  value: string | number;
  label: string;
  icon?: string | React.ReactNode;
}

interface CustomSelectProps {
  value: string | number;
  onChange: (value: any) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ 
  value, onChange, options, placeholder = "Select...", className, disabled 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null); // Ref for the actual list
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const selectedOption = options.find(o => o.value === value);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 6, // Slight gap
        left: rect.left,
        width: rect.width
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      const handleScroll = (event: Event) => {
        // If the scroll event happened INSIDE the dropdown list, ignore it
        if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
          return;
        }
        // Otherwise (scrolling the page/body), close the dropdown
        setIsOpen(false);
      };

      // Capture phase is needed to detect scrolling on parent containers
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', () => setIsOpen(false));
      
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', () => setIsOpen(false));
      };
    }
  }, [isOpen]);

  const handleSelect = (val: string | number) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <>
      <div className={clsx("relative", className)} ref={containerRef}>
        <button
          type="button"
          onClick={() => {
            if (!disabled) {
              updateCoords();
              setIsOpen(!isOpen);
            }
          }}
          disabled={disabled}
          className={clsx(
            "w-full flex items-center justify-between bg-slate-950 border rounded-lg px-3 py-2.5 text-sm transition-all outline-none",
            isOpen ? "border-amber-500 ring-1 ring-amber-500/50" : "border-slate-700 hover:border-slate-600",
            disabled ? "opacity-50 cursor-not-allowed bg-slate-900" : "cursor-pointer text-white"
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {selectedOption ? (
              <>
                {selectedOption.icon && (
                  <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                    {typeof selectedOption.icon === 'string' && (selectedOption.icon.startsWith('http') || selectedOption.icon.startsWith('data:')) ? (
                      <img src={selectedOption.icon} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="text-lg leading-none">{selectedOption.icon}</span>
                    )}
                  </span>
                )}
                <span className="truncate">{selectedOption.label}</span>
              </>
            ) : (
              <span className="text-slate-500">{placeholder}</span>
            )}
          </div>
          <ChevronDown size={16} className={clsx("text-slate-500 transition-transform", isOpen && "rotate-180")} />
        </button>
      </div>

      {/* PORTAL RENDER: Drops the menu into the body to avoid overflow clipping */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[9999]">
          {/* Invisible backdrop to catch clicks outside */}
          <div className="absolute inset-0" onClick={() => setIsOpen(false)} />
          
          <MotionDiv
            ref={dropdownRef}
            initial={{ opacity: 0, y: -5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.98 }}
            transition={{ duration: 0.1 }}
            style={{ 
              top: coords.top, 
              left: coords.left, 
              width: coords.width 
            }}
            className="absolute bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto custom-scrollbar overflow-x-hidden"
          >
            <div className="p-1">
              {options.length > 0 ? options.map((option) => {
                 const isSelected = option.value === value;
                 return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation(); 
                      handleSelect(option.value);
                    }}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left",
                      isSelected ? "bg-amber-500/10 text-amber-500" : "text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    {option.icon && (
                      <span className="shrink-0 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                        {typeof option.icon === 'string' && (option.icon.startsWith('http') || option.icon.startsWith('data:')) ? (
                          <img src={option.icon} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm">{option.icon}</span>
                        )}
                      </span>
                    )}
                    <span className="flex-1 truncate font-medium">{option.label}</span>
                    {isSelected && <Check size={14} className="shrink-0" />}
                  </button>
                );
              }) : (
                <div className="px-3 py-4 text-center text-xs text-slate-500 italic">No options available</div>
              )}
            </div>
          </MotionDiv>
        </div>,
        document.body
      )}
    </>
  );
};