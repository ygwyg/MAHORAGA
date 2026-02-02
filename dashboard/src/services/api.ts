export const API_BASE = '/api'

export function getApiToken(): string {
  return localStorage.getItem('mahoraga_api_token') || import.meta.env.VITE_MAHORAGA_API_TOKEN || ''
}

export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getApiToken()
  const headers = new Headers(options.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...options, headers })
}
