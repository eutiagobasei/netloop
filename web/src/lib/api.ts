import axios from 'axios'
import Cookies from 'js-cookie'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333',
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
          const { data } = await axios.post(
            `${api.defaults.baseURL}/auth/refresh`,
            { refreshToken }
          )
          Cookies.set('accessToken', data.accessToken, { expires: 1 / 96 })
          Cookies.set('refreshToken', data.refreshToken, { expires: 7 })
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
          return api(originalRequest)
        } catch {
          Cookies.remove('accessToken')
          Cookies.remove('refreshToken')
          window.location.href = '/login'
        }
      }
    }

    return Promise.reject(error)
  }
)

export interface LoginCredentials {
  email: string
  password: string
}

export const authApi = {
  login: (credentials: LoginCredentials) =>
    api.post<{ accessToken: string; refreshToken: string; expiresIn: number }>(
      '/auth/login',
      credentials
    ),
  me: () => api.get('/auth/me'),
}

export interface GraphNode {
  id: string
  name: string
  type: 'user' | 'contact'
  degree: number
  tags?: { id: string; name: string; color: string | null }[]
  company?: string | null
  position?: string | null
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

export default api
