import axios from "axios"

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
})

api.interceptors.request.use((config) => {
  // TODO: attach JWT access token from secure storage
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // TODO: handle 401 → token refresh flow
    return Promise.reject(error)
  }
)

export default api
