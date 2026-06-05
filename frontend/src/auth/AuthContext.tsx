import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CurrentUser,
  clearStoredToken,
  fetchCurrentUser,
  getStoredToken,
  loginRequest,
  onUnauthorized,
  registerRequest,
  setStoredToken,
} from "../api/client";

type AuthContextValue = {
  token: string | null;
  currentUser: CurrentUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(token));

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setCurrentUser(null);
    setIsLoading(false);
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    const storedToken = getStoredToken();
    if (!storedToken) {
      logout();
      return;
    }
    setIsLoading(true);
    try {
      const user = await fetchCurrentUser();
      setCurrentUser(user);
      setToken(storedToken);
    } catch (caught) {
      logout();
      throw caught;
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await loginRequest(email, password);
      setStoredToken(response.access_token);
      setToken(response.access_token);
      await refreshCurrentUser();
    },
    [refreshCurrentUser],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      await registerRequest(email, password, displayName);
      await login(email, password);
    },
    [login],
  );

  useEffect(() => {
    if (token) {
      void refreshCurrentUser().catch(() => undefined);
    }
  }, [refreshCurrentUser, token]);

  useEffect(() => onUnauthorized(logout), [logout]);

  const value = useMemo(
    () => ({
      token,
      currentUser,
      isLoading,
      login,
      logout,
      register,
      refreshCurrentUser,
    }),
    [currentUser, isLoading, login, logout, refreshCurrentUser, register, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
