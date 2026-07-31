"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, MOCK_CURRENT_USER } from "@/lib/mock/users";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const STORAGE_KEY_TOKEN = "datamind_auth_token";
const STORAGE_KEY_USER = "datamind_auth_user";

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Restore authentication state from session/local storage
    try {
      const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN) || sessionStorage.getItem(STORAGE_KEY_TOKEN);
      const storedUser = localStorage.getItem(STORAGE_KEY_USER) || sessionStorage.getItem(STORAGE_KEY_USER);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to restore auth state from storage:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);

    // Simulate network latency (400ms)
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Simple mock authentication check
    if (email.toLowerCase().includes("fail") || password === "wrong") {
      setIsLoading(false);
      return { success: false, error: "Invalid email or password combination." };
    }

    const mockToken = `mock_jwt_${Math.random().toString(36).substring(2)}_${Date.now()}`;
    const loggedInUser: User = {
      ...MOCK_CURRENT_USER,
      email: email.trim().toLowerCase(),
    };

    setToken(mockToken);
    setUser(loggedInUser);

    try {
      localStorage.setItem(STORAGE_KEY_TOKEN, mockToken);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(loggedInUser));
    } catch (e) {
      console.warn("Could not save auth to localStorage:", e);
    }

    setIsLoading(false);
    return { success: true };
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_USER);
      sessionStorage.removeItem(STORAGE_KEY_TOKEN);
      sessionStorage.removeItem(STORAGE_KEY_USER);
    } catch (e) {
      console.warn("Could not clear storage:", e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
