import axios from 'axios'

const TOKEN_KEY = 'sap_access_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // localStorage может быть недоступен (приватный режим) — в этом случае просто
    // не переживёт перезагрузку страницы, не критично для работы в рамках сессии.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* см. комментарий выше */
  }
}

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken()
      if (!location.pathname.startsWith('/login')) {
        location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

/**
 * Скачивание защищённого файла (CSV-экспорты и т.п.) — обычная ссылка
 * <a href="/api/..."> не несёт Authorization-заголовок (JWT только в
 * localStorage, не в cookie), запрос падает 401 раньше, чем браузер
 * увидит файл. Запрашивает через тот же authenticated-клиент api и
 * скачивает результат через Blob + временную ссылку.
 */
export async function downloadFile(path: string, filename: string) {
  const response = await api.get(path, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
