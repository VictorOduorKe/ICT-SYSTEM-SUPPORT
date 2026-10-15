export type UserRole = 'ict_officer' | 'supervisor' | 'administrator';

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SessionRecord {
  session_id: string;
  user_id: number;
  expires_at: string;
  data: any;
  created_at: string;
  user?: AuthUser;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}
