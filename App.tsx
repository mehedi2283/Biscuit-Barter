import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { Login } from './pages/Login';
import { Loader2 } from 'lucide-react';

const LoadingScreen = () => (
  <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
    <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Loading Market...</p>
  </div>
);

const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activePage, setActivePage] = useState<'dashboard' | 'admin' | 'profile'>('dashboard');

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  // Router Logic (Simple state based)
  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard />;
      case 'admin':
        // Protect Admin Route
        return user?.role === 'ADMIN' ? <AdminDashboard /> : <div className="p-8 text-center text-red-400 border border-red-500/20 rounded-xl bg-red-500/10 m-8">Access Denied: Admin Clearance Required</div>;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {renderPage()}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;