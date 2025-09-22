import { apiClient } from './client'
import { PlatformCredential, PlatformCredentialCreate, PlatformCredentialUpdate } from '@/types/platform-credential'

export const platformCredentialsApi = {
  async getAll(): Promise<PlatformCredential[]> {
    const response = await apiClient.get('/platform-credentials/')
    return response.data
  },

  async getById(id: number): Promise<PlatformCredential> {
    const response = await apiClient.get(`/platform-credentials/${id}`)
    return response.data
  },

  async create(credential: PlatformCredentialCreate): Promise<PlatformCredential> {
    const response = await apiClient.post('/platform-credentials/', credential)
    return response.data
  },

  async update(id: number, credential: PlatformCredentialUpdate): Promise<PlatformCredential> {
    const response = await apiClient.put(`/platform-credentials/${id}`, credential)
    return response.data
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/platform-credentials/${id}`)
  },

  async validate(id: number): Promise<{ is_valid: boolean; message: string; permissions?: string[] }> {
    const response = await apiClient.post(`/platform-credentials/${id}/validate`)
    return response.data
  }
}
