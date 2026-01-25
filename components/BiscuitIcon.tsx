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
    sm: 'w-8 h-8 text-lg',
    md: 'w-12 h-12 text-2xl',
    lg: 'w-16 h-16 text-3xl',
    xl: 'w-24 h-24 text-6xl'
  };

  const isUrl = biscuit.icon.startsWith('http') || biscuit.icon.startsWith('data:image');

  return (
    <div className={clsx(
      "rounded-full flex items-center justify-center shadow-lg relative overflow-hidden ring-1 ring-white/10 shrink-0",
      biscuit.color,
      sizeClasses[size],
      className
    )}>
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
      {isUrl ? (
        <img 
          src={biscuit.icon} 
          alt={biscuit.name} 
          className="w-full h-full object-cover" 
        />
      ) : (
        <span className="relative z-10 drop-shadow-md transform hover:scale-110 transition-transform cursor-default filter contrast-125 select-none">
          {biscuit.icon}
        </span>
      )}
    </div>
  );
};