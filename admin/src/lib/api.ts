import axios from 'axios'
import Cookies from 'js-cookie'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333'
const API_URL = `${API_BASE}/api`

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = Cookies.get('refreshToken')
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          })

          Cookies.set('accessToken', data.accessToken, { expires: 1 / 96 }) // 15 min
          Cookies.set('refreshToken', data.refreshToken, { expires: 7 })

          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
          return api(originalRequest)
        } catch {
          Cookies.remove('accessToken')
          Cookies.remove('refreshToken')
          window.location.href = '/login'
        }
      } else {
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  }
)

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    name: string
    role: 'ADMIN' | 'USER'
  }
}

export interface Setting {
  id: string
  key: string
  value: string
  category: 'AI' | 'WHATSAPP' | 'SYSTEM'
  isEncrypted: boolean
  description: string | null
  updatedAt: string
}

export interface Stats {
  totalUsers: number
  totalContacts: number
  totalMessages: number
  totalConnections: number
}

export const authApi = {
  login: (credentials: LoginCredentials) =>
    api.post<AuthResponse>('/auth/login', credentials),

  logout: () => api.post('/auth/logout'),

  me: () => api.get<AuthResponse['user']>('/auth/me'),
}

// Connections / Graph Types
export interface GraphNode {
  id: string
  name: string
  type: 'user' | 'contact' | 'mentioned'
  degree: number
  tags?: { id: string; name: string; color: string | null }[]
  company?: string | null
  position?: string | null
  description?: string | null
  phone?: string | null
  email?: string | null
  context?: string | null
  location?: string | null
}

export interface GraphEdge {
  source: string
  target: string
  strength: 'WEAK' | 'MODERATE' | 'STRONG'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const connectionsApi = {
  getGraph: (depth = 2) =>
    api.get<GraphData>('/connections/graph', { params: { depth } }),
  getAll: () => api.get('/connections'),
  getSecondDegree: (search?: string) =>
    api.get('/connections/second-degree', { params: { search } }),
}

export const settingsApi = {
  getAll: (category?: string) =>
    api.get<Setting[]>('/settings', { params: { category } }),

  getByKey: (key: string) =>
    api.get<Setting>(`/settings/${key}`),

  upsert: (data: { key: string; value: string; category: string; isEncrypted?: boolean; description?: string }) =>
    api.post<Setting>('/settings', data),

  bulkUpdate: (settings: { key: string; value: string }[]) =>
    api.patch<Setting[]>('/settings/bulk', { settings }),

  delete: (key: string) =>
    api.delete(`/settings/${key}`),

  testEvolution: () =>
    api.post<{ success: boolean; message: string }>('/settings/evolution/test'),

  getStats: () =>
    api.get<Stats>('/settings/stats'),
}
