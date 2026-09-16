import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { persistSession, readSession, clearSession, fetchMe, hasLiveSession } from '../utils/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [farmer, setFarmer] = useState(() => {
    const session = readSession();
    if (hasLiveSession(session)) return session;
    if (session) clearSession();
    return null;
  });

  useEffect(() => {
    let cancelled = false;
    const session = readSession();
    if (!session?.token) return undefined;
    fetchMe(session.token)
      .then(({ ok, status, data }) => {
        if (cancelled) return;
        if (status === 401) {
          clearSession();
          setFarmer(null);
          return;
        }
        if (ok && data?.farmer) {
          setFarmer(persistSession({ token: session.token, farmer: data.farmer }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({
    farmer,
    isAuthed: hasLiveSession(farmer),
    setSession: (payload) => setFarmer(persistSession(payload)),
    logout: () => {
      clearSession();
      setFarmer(null);
    },
  }), [farmer]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext) || {
    farmer: readSession(),
    isAuthed: hasLiveSession(),
    setSession: persistSession,
    logout: clearSession,
  };
}
