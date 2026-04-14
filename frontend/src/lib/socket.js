import { io } from 'socket.io-client';

// Use Vite environment variable for backend socket URL
// Set VITE_SOCKET_URL in your .env file (e.g., VITE_SOCKET_URL=https://your-backend.com)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

let socketInstance = null;
let currentToken = null;

export const getSocket = (token) => {
  if (!token) return null;

  if (socketInstance && currentToken === token) {
    return socketInstance;
  }

  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  currentToken = token;
  socketInstance = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: {
      token
    }
  });

  return socketInstance;
};

export const closeSocket = () => {
  if (!socketInstance) return;
  socketInstance.disconnect();
  socketInstance = null;
  currentToken = null;
};
