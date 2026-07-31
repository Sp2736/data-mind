export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'analyst' | 'viewer';
  avatarUrl?: string;
  createdAt: string;
}

export const MOCK_CURRENT_USER: User = {
  id: 'user_01HGB897XYZ',
  email: 'analyst@datamind.ai',
  name: 'Alex Mercer',
  role: 'analyst',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  createdAt: '2026-01-15T08:30:00Z',
};

export const MOCK_USERS: User[] = [
  MOCK_CURRENT_USER,
  {
    id: 'user_02HGB897ABC',
    email: 'admin@datamind.ai',
    name: 'Sarah Connor',
    role: 'admin',
    createdAt: '2026-01-10T10:00:00Z',
  },
];
