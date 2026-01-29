import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Lock } from 'lucide-react';
import { Biscuit, ExchangeRule } from '../types';
import { BiscuitIcon } from './BiscuitIcon';
import clsx from 'clsx';

// Fix for framer-motion type issues
const MotionDiv = motion.div as any;

interface TradeCardProps {
  rule: ExchangeRule;
  fromBiscuit: Biscuit;
  toBiscuit: Biscuit;
  userBalance: number;
  onTrade: (ruleId: string) => void;
}

export const TradeCard: React.FC<TradeCardProps> = ({ 
  rule, fromBiscuit, toBiscuit, userBalance, onTrade 
}) => {
  const canAfford = userBalance >= rule.fromQty;

  return (
    <MotionDiv 
      whileHover={{ y: -4 }}
      className={clsx(
        "relative rounded-2xl p-5 md:p-8 border transition-all duration-300 flex flex-col justify-between h-full",
        canAfford 
          ? "bg-slate-800 border-slate-700 hover:border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/10" 
          : "bg-slate-800/50 border-slate-800 opacity-60"
      )}
    >
      {!canAfford && (
        <div className="absolute inset-0 z-10 bg-slate-900/40 backdrop-blur-[1px] rounded-2xl flex items-center justify-center">
          <div className="bg-slate-900 text-slate-400 px-4 py-2 rounded-full text-xs md:text-sm font-bold border border-slate-700 flex items-center gap-2 shadow-xl">
            <Lock size={14} /> Insufficient Stock
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-8 md:mb-10 mt-2">
        {/* From */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <BiscuitIcon biscuit={fromBiscuit} size="lg" className="md:w-32 md:h-32 md:text-6xl transition-all" />
            <div className="absolute -bottom-2 -right-2 bg-slate-900 text-slate-200 text-xs md:text-sm font-bold px-2.5 py-1 rounded-full border border-slate-700 min-w-[1.5rem] text-center">
              x{rule.fromQty}
            </div>
          </div>
          <span className="mt-4 text-sm md:text-lg font-bold text-slate-300 text-center leading-tight">{fromBiscuit.name}</span>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center justify-center px-2 md:px-6">
          <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-slate-900 flex items-center justify-center border border-slate-700 text-slate-500 shadow-inner">
            <ArrowRight className="w-5 h-5 md:w-7 md:h-7" />
          </div>
        </div>

        {/* To */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <BiscuitIcon biscuit={toBiscuit} size="lg" className="md:w-32 md:h-32 md:text-6xl transition-all" />
            <div className="absolute -bottom-2 -right-2 bg-amber-500 text-slate-900 text-xs md:text-sm font-bold px-2.5 py-1 rounded-full border border-amber-400 shadow-lg shadow-amber-500/20 min-w-[1.5rem] text-center">
              x{rule.toQty}
            </div>
          </div>
          <span className="mt-4 text-sm md:text-lg font-bold text-slate-300 text-center leading-tight">{toBiscuit.name}</span>
        </div>
      </div>

      <button
        onClick={() => canAfford && onTrade(rule.id)}
        disabled={!canAfford}
        className={clsx(
          "w-full py-3 md:py-5 rounded-xl font-bold text-sm md:text-lg tracking-wide transition-all active:scale-95 uppercase",
          canAfford 
            ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40" 
            : "bg-slate-700 text-slate-500 cursor-not-allowed"
        )}
      >
        {canAfford ? 'SWAP NOW' : `Need ${rule.fromQty - userBalance} More`}
      </button>
    </MotionDiv>
  );
};