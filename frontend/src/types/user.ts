export interface User {
  id: number
  email: string
  username: string
  full_name?: string
  is_active: boolean
  is_superuser: boolean
  avatar_url?: string
  created_at: string
  updated_at?: string
}

export interface UserCreate {
  email: string
  username: string
  password: string
  full_name?: string
}

export interface UserUpdate {
  email?: string
  username?: string
  full_name?: string
  password?: string
  avatar_url?: string
}
