import React from 'react';
import clsx from 'clsx';
import { Biscuit } from '../types';

interface BiscuitIconProps {
  biscuit: Biscuit;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const BiscuitIcon: React.FC<BiscuitIconProps> = ({ biscuit, size = 'md', className }) => {
  const sizeClasses = {
    sm: 'w-10 h-10 text-xl',
    md: 'w-16 h-16 text-3xl',
    lg: 'w-24 h-24 text-5xl',
    xl: 'w-32 h-32 text-7xl'
  };

  const isUrl = biscuit.icon.startsWith('http') || biscuit.icon.startsWith('data:image');

  return (
    <div className={clsx(
      "rounded-full flex items-center justify-center shadow-xl relative overflow-hidden ring-4 ring-slate-950/50 shrink-0 bg-slate-900",
      biscuit.color,
      sizeClasses[size],
      className
    )}>
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
      {isUrl ? (
        <img 
          src={biscuit.icon} 
          alt={biscuit.name} 
          className="w-full h-full object-cover transform hover:scale-110 transition-transform duration-500" 
        />
      ) : (
        <span className="relative z-10 drop-shadow-md transform hover:scale-110 transition-transform cursor-default filter contrast-125 select-none">
          {biscuit.icon}
        </span>
      )}
    </div>
  );
};