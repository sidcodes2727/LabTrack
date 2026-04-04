import { io } from 'socket.io-client';

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
  socketInstance = io('http://localhost:4000', {
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
