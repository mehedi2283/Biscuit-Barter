import React from 'react';
import { Modal } from './Modal';
import { AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, title = "Confirm Action", message, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel, isDestructive = false
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} maxWidth="max-w-sm" icon={<AlertCircle className={isDestructive ? "text-red-500" : "text-amber-500"} size={20} />}>
      <div className="space-y-6">
        <p className="text-slate-300 text-sm leading-relaxed">
          {message}
        </p>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-400 font-bold text-xs uppercase tracking-wide hover:bg-slate-800 transition-colors"
          >
            {cancelLabel}
          </button>
          <button 
            onClick={() => { onConfirm(); onCancel(); }}
            className={`flex-1 py-2.5 rounded-lg text-white font-bold text-xs uppercase tracking-wide shadow-lg transition-all ${
              isDestructive 
                ? "bg-red-600 hover:bg-red-500 shadow-red-900/20" 
                : "bg-amber-600 hover:bg-amber-500 shadow-amber-900/20"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};