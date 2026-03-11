import { io } from 'socket.io-client';

let _socket = null;

export function getSocket() {
  if (!_socket) {
    _socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
  }
  return _socket;
}

export function useSocket() {
  return getSocket();
}
