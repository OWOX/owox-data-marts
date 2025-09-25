"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, authService } from '@/lib/auth'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refetchUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = async () => {
    try {
      if (authService.isAuthenticated()) {
        const userData = await authService.getCurrentUser()
        setUser(userData)
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUser()
  }, [])

  const login = async (username: string, password: string) => {
    setLoading(true)
    try {
      await authService.login({ username, password })
      await fetchUser()
    } catch (error) {
      setLoading(false)
      throw error
    }
  }

  const logout = () => {
    authService.logout()
    setUser(null)
  }

  const refetchUser = async () => {
    await fetchUser()
  }

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    refetchUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
