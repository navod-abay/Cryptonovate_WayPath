import type { Outlet, User } from '@/types';

/**
 * Dummy store manager accounts (one per store type) until auth-rbac is connected.
 * Password for all of them: Password123!
 */
export interface MockAccount {
  user: User;
  password: string;
  outlet: Outlet;
}

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    user: { id: 'u-out015', outletId: 'OUT015', username: 'manager_out015', fullName: 'Tharindu Perera', role: 'store_manager', email: 'tharindu.p@waypoint.lk', phone: '+94 77 123 4567', memberSince: '2024-03-11' },
    password: 'Password123!',
    outlet: {
      id: 'OUT015', city: 'Colombo', managerName: 'Tharindu', storeName: 'Waypoint Fresh – Colombo 07',
      storeType: 'grocery', categories: ['chilled', 'dry'], address: '42 Ward Place, Colombo 07',
    },
  },
  {
    user: { id: 'u-out021', outletId: 'OUT021', username: 'manager_out021', fullName: 'Nadeesha Silva', role: 'store_manager', email: 'nadeesha.s@waypoint.lk', phone: '+94 71 555 0198', memberSince: '2025-01-20' },
    password: 'Password123!',
    outlet: {
      id: 'OUT021', city: 'Kandy', managerName: 'Nadeesha', storeName: 'Waypoint Tech – Kandy City',
      storeType: 'tech', categories: ['tech'], address: '18 Dalada Veediya, Kandy',
    },
  },
  {
    user: { id: 'u-out034', outletId: 'OUT034', username: 'manager_out034', fullName: 'Kasun Fernando', role: 'store_manager', email: 'kasun.f@waypoint.lk', phone: '+94 76 402 7781', memberSince: '2023-09-02' },
    password: 'Password123!',
    outlet: {
      id: 'OUT034', city: 'Galle', managerName: 'Kasun', storeName: 'Waypoint Style – Galle Fort',
      storeType: 'style', categories: ['style'], address: '7 Church Street, Galle Fort',
    },
  },
];
