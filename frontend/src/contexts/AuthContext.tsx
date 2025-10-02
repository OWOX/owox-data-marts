"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { User } from '@/types/user'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string, fullName?: string) => Promise<void>
  logout: () => void
  refetchUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchUser = async () => {
    try {
      if (authApi.isAuthenticated()) {
        const userData = await authApi.getCurrentUser()
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

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      await authApi.login(email, password)
      await fetchUser()
      
      // Redirect to dashboard after successful login
      router.push('/dashboard')
    } catch (error) {
      setLoading(false)
      throw error
    }
  }

  const register = async (email: string, username: string, password: string, fullName?: string) => {
    setLoading(true)
    try {
      await authApi.register({ email, username, password, full_name: fullName })
      // Auto-login after registration
      await login(email, password)
    } catch (error) {
      setLoading(false)
      throw error
    }
  }

  const logout = () => {
    authApi.logout()
    setUser(null)
    router.push('/login')
  }

  const refetchUser = async () => {
    await fetchUser()
  }

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
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
