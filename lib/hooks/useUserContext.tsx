'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface UserContextValue {
  myUserId: string;
  myName: string;
  partnerUserId: string | null;
  partnerName: string | null;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserContextProvider({
  value,
  children,
}: {
  value: UserContextValue;
  children: ReactNode;
}) {
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUserContext must be used inside <UserContextProvider>');
  }
  return ctx;
}
