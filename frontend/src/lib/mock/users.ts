export interface User {
  id: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  created_at: string;
  name?: string;
  avatar_url?: string;
}

export const MOCK_CURRENT_USER: User = {
  id: 'usr_01HGB897XYZ',
  email: 'analyst@datamind.ai',
  role: 'analyst',
  created_at: '2026-01-15T08:30:00Z',
  name: 'Alex Mercer',
  avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
};

export const MOCK_USERS: User[] = [
  MOCK_CURRENT_USER,
  {
    id: 'usr_02HGB897ABC',
    email: 'admin@datamind.ai',
    role: 'admin',
    created_at: '2026-01-10T10:00:00Z',
    name: 'Sarah Connor',
  },
];
