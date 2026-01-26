import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Cookie, ArrowRight, UserPlus, LogIn, Lock, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Fix for framer-motion type issues
const MotionDiv = motion.div as any;

export const Login: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (!email || !password) {
      setError('Email and Password are required');
      setIsSubmitting(false);
      return;
    }

    try {
      if (isRegistering) {
        if (!name) {
          setError('Name is required for sign up');
          setIsSubmitting(false);
          return;
        }
        const res = await register(name, email, password);
        if (!res.success) {
          setError(res.message || 'Registration failed.');
        } else {
          // On success registration, stay on login or show success message
          setError('');
          setIsRegistering(false); 
          alert(res.message); // Simple feedback for registration success
        }
      } else {
        const res = await login(email, password);
        if (!res.success) {
          if (res.message?.includes("Email not confirmed")) {
            setError("Please check your inbox to verify your email address before logging in.");
          } else if (res.message?.includes("Invalid login credentials")) {
            setError("Incorrect email or password.");
          } else {
            setError(res.message || 'Login failed.');
          }
        }
        // If success, AuthContext updates 'user', App component re-renders and redirects to Dashboard
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden font-sans">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800/20 via-slate-950 to-slate-950" />
      </div>

      <MotionDiv 
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900 p-8 rounded-xl border border-slate-800 shadow-2xl relative z-10 mx-4"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center mb-4 shadow-lg shadow-amber-500/20 rotate-3">
            <Cookie size={24} className="text-slate-900" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">BiscuitBarter</h1>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-2">Internal Exchange</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence>
            {isRegistering && (
              <MotionDiv
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pb-4">
                   <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                   <input 
                     type="text" 
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     className="w-full bg-slate-950 border border-slate-800 text-slate-200 px-4 py-3 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all placeholder:text-slate-700 text-sm"
                     placeholder="e.g. Cookie Monster"
                   />
                </div>
              </MotionDiv>
            )}
          </AnimatePresence>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Access</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 px-4 py-3 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all placeholder:text-slate-700 text-sm"
              placeholder="name@barter.com"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
            <div className="relative">
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 px-4 py-3 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all placeholder:text-slate-700 text-sm pl-4 pr-10"
                placeholder="••••••••"
              />
              <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600" />
            </div>
          </div>

          {error && (
            <MotionDiv 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-red-400 text-xs text-center font-medium bg-red-400/10 py-3 px-2 rounded border border-red-500/20"
            >
              {error}
            </MotionDiv>
          )}

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg shadow-lg shadow-amber-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isRegistering ? (
              <>Create Account <UserPlus size={16} /></>
            ) : (
              <>Enter Market <ArrowRight size={16} /></>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-slate-500 text-xs mb-3">
            {isRegistering ? "Already have an account?" : "Don't have an account?"}
          </p>
          <button 
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            className="text-amber-500 hover:text-amber-400 text-sm font-bold transition-colors uppercase tracking-wide"
          >
            {isRegistering ? "Login Here" : "Create New Account"}
          </button>
        </div>

      </MotionDiv>
    </div>
  );
};