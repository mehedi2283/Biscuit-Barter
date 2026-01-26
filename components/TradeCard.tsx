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
        "relative rounded-2xl p-5 border transition-all duration-300",
        canAfford 
          ? "bg-slate-800 border-slate-700 hover:border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/10" 
          : "bg-slate-800/50 border-slate-800 opacity-60"
      )}
    >
      {!canAfford && (
        <div className="absolute inset-0 z-10 bg-slate-900/40 backdrop-blur-[1px] rounded-2xl flex items-center justify-center">
          <div className="bg-slate-900 text-slate-400 px-3 py-1 rounded-full text-xs font-bold border border-slate-700 flex items-center gap-2">
            <Lock size={12} /> Insufficient Stock
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        {/* From */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <BiscuitIcon biscuit={fromBiscuit} size="lg" />
            <div className="absolute -bottom-2 -right-2 bg-slate-900 text-slate-200 text-xs font-bold px-2 py-0.5 rounded-full border border-slate-700">
              x{rule.fromQty}
            </div>
          </div>
          <span className="mt-3 text-sm font-medium text-slate-400">{fromBiscuit.name}</span>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center justify-center px-4">
          <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center border border-slate-700 text-slate-500">
            <ArrowRight size={18} />
          </div>
        </div>

        {/* To */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <BiscuitIcon biscuit={toBiscuit} size="lg" />
            <div className="absolute -bottom-2 -right-2 bg-amber-500 text-slate-900 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-400 shadow-lg shadow-amber-500/20">
              x{rule.toQty}
            </div>
          </div>
          <span className="mt-3 text-sm font-medium text-slate-400">{toBiscuit.name}</span>
        </div>
      </div>

      <button
        onClick={() => canAfford && onTrade(rule.id)}
        disabled={!canAfford}
        className={clsx(
          "w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95",
          canAfford 
            ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40" 
            : "bg-slate-700 text-slate-500 cursor-not-allowed"
        )}
      >
        {canAfford ? 'SWAP NOW' : `NEED ${rule.fromQty - userBalance} MORE`}
      </button>
    </MotionDiv>
  );
};