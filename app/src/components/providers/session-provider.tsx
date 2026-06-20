import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';

import {
  ensureUserData,
  type AutoSenseUserDoc,
  useUserSnapshot,
} from '@/lib/autosense-data';
import { auth } from '@/lib/firebase-client';

type SessionContextValue = {
  firebaseUser: User | null;
  profile: AutoSenseUserDoc | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOutUser: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const { data: profile, isLoading: isProfileLoading } = useUserSnapshot(
    firebaseUser?.uid,
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setFirebaseUser(nextUser);

      if (!nextUser) {
        setIsBootstrapping(false);
        setIsAuthLoading(false);
        return;
      }

      setIsBootstrapping(true);

      try {
        await ensureUserData(nextUser);
      } finally {
        setIsBootstrapping(false);
        setIsAuthLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      firebaseUser,
      profile,
      isLoading: isAuthLoading || isBootstrapping || isProfileLoading,
      isAuthenticated: Boolean(firebaseUser),
      signOutUser: () => signOut(auth),
    }),
    [firebaseUser, isAuthLoading, isBootstrapping, isProfileLoading, profile],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return value;
}
