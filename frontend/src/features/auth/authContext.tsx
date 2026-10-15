import React, { createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type UserRole = 'ict_officer' | 'supervisor' | 'administrator';

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  error: Error | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useQuery<AuthUser | null>({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const res = await fetch('/api/v1/auth/me');
      if (res.status === 401) {
        return null;
      }
      if (!res.ok) {
        throw new Error('Failed to fetch authentication status');
      }
      const data = await res.json();
      return data.data?.user || null;
    },
    staleTime: 60000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Login failed');
      }
      return json.data.user;
    },
    onSuccess: (newUser) => {
      queryClient.setQueryData(['auth-user'], newUser);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth-user'], null);
    },
  });

  const login = async (credentials: { username: string; password: string }) => {
    await loginMutation.mutateAsync(credentials);
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading: isLoading || loginMutation.isPending || logoutMutation.isPending,
        isAuthenticated: Boolean(user),
        login,
        logout,
        error: (loginMutation.error as Error) || (error as Error) || null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
