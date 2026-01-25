import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, icon, children, maxWidth = 'max-w-md' }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }} 
            animate={{ opacity: 1, scale: 1, y: 0 }} 
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
            className={`w-full ${maxWidth} bg-slate-900 border border-slate-700 rounded-xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]`}
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-3 tracking-tight">
                {icon && <span className="p-1.5 bg-slate-800 rounded-lg border border-slate-700">{icon}</span>}
                {title}
              </h3>
              <button 
                onClick={onClose} 
                className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-slate-800 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};