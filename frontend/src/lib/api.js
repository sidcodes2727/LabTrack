import axios from 'axios';

// Use Vite environment variable for backend API URL
// Set VITE_API_URL in your .env file (e.g., VITE_API_URL=https://your-backend.com/api)
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('labtrack_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
