import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutDashboard, Settings, UserCircle, Cookie } from 'lucide-react';
import clsx from 'clsx';

interface LayoutProps {
  children: React.ReactNode;
  activePage: 'dashboard' | 'admin' | 'profile';
  onNavigate: (page: 'dashboard' | 'admin' | 'profile') => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activePage, onNavigate }) => {
  const { user, logout } = useAuth();

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar / Navbar */}
      <nav className="w-full md:w-64 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex-shrink-0 sticky top-0 md:h-screen z-20 shadow-xl shadow-black/20">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800/50">
          <div className="bg-amber-500 p-1.5 rounded-md shadow-lg shadow-amber-500/20">
            <Cookie className="text-slate-900 w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white leading-tight">BiscuitBarter</h1>
            <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">Crunchy Economics</p>
          </div>
        </div>

        <div className="px-3 py-4 flex flex-col gap-1">
          {user && (
            <div className="mb-6 px-4 py-3 bg-slate-800/50 rounded-lg border border-slate-700/50 backdrop-blur-sm">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Signed in as</p>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm text-slate-200 truncate">{user.name}</p>
                <span className={clsx(
                  "text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide",
                  isAdmin ? "bg-purple-500/10 text-purple-400 border-purple-500/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                )}>
                  {user.role}
                </span>
              </div>
            </div>
          )}

          <NavItem 
            icon={<LayoutDashboard size={18} />} 
            label="Trading Floor" 
            active={activePage === 'dashboard'} 
            onClick={() => onNavigate('dashboard')} 
          />
          
          {isAdmin && (
            <NavItem 
              icon={<Settings size={18} />} 
              label="Admin Console" 
              active={activePage === 'admin'} 
              onClick={() => onNavigate('admin')} 
            />
          )}

          <div className="mt-8 border-t border-slate-800 pt-4">
            <button 
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all text-sm font-medium border border-transparent hover:border-red-500/20"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full bg-slate-950">
        {children}
      </main>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={clsx(
      "flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 text-sm font-medium border",
      active 
        ? "bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-sm" 
        : "text-slate-400 border-transparent hover:bg-slate-800 hover:text-slate-200"
    )}
  >
    {icon}
    <span>{label}</span>
  </button>
);