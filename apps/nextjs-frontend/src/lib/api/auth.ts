import { apiClient } from './client'
import { User, UserCreate } from '@/types/user'

export interface LoginResponse {
  access_token: string
  token_type: string
}

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const formData = new FormData()
    formData.append('username', email)
    formData.append('password', password)
    
    const response = await apiClient.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    return response.data
  },

  async register(userData: UserCreate): Promise<User> {
    const response = await apiClient.post('/auth/register', userData)
    return response.data
  },

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get('/users/me')
    return response.data
  },

  async updateProfile(userData: Partial<User>): Promise<User> {
    const response = await apiClient.put('/users/me', userData)
    return response.data
  }
}
