import React, { useState } from 'react';
import { useAuth } from './authContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Lock, User, AlertCircle, KeyRound, ShieldAlert } from 'lucide-react';

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await login({ username, password });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setErrorMessage(null);
  };

  return (
    <Card className="max-w-md w-full mx-auto p-8 border border-surface-border bg-surface-card rounded-lg shadow-none">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-brand-600 text-white rounded-md mx-auto flex items-center justify-center font-bold text-xl mb-3">
          <Lock className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-xl font-bold text-content-primary">System Authentication</h2>
        <p className="text-xs text-content-secondary mt-1">
          Authorized ICT Staff Login — LAN Access Restricted
        </p>
      </div>

      {errorMessage && (
        <div className="mb-5 p-3 rounded bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-content-primary mb-1">
            Username
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
              <User className="w-4 h-4" />
            </span>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoComplete="username"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-content-primary mb-1">
            Password
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
              <KeyRound className="w-4 h-4" />
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface-base border border-surface-border rounded-md text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoComplete="current-password"
            />
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={isLoading}
          className="w-full mt-2"
        >
          Sign In
        </Button>
      </form>

      {/* Development Quick Role Switcher */}
      <div className="mt-8 pt-6 border-t border-surface-border">
        <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase text-content-muted">
          <ShieldAlert className="w-3.5 h-3.5 text-brand-600" />
          <span>Test Role Pre-fills (Dev Mode)</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleQuickFill('admin', 'Admin123!@#')}
            className="px-2 py-1.5 text-xs font-medium rounded bg-surface-hover hover:bg-surface-border border border-surface-border text-content-primary transition-colors text-center"
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill('supervisor', 'Supervisor123!@#')}
            className="px-2 py-1.5 text-xs font-medium rounded bg-surface-hover hover:bg-surface-border border border-surface-border text-content-primary transition-colors text-center"
          >
            Supervisor
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill('ictofficer', 'Officer123!@#')}
            className="px-2 py-1.5 text-xs font-medium rounded bg-surface-hover hover:bg-surface-border border border-surface-border text-content-primary transition-colors text-center"
          >
            ICT Officer
          </button>
        </div>
      </div>
    </Card>
  );
};
