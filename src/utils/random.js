import { customAlphabet } from 'nanoid';

const roomAlphabet = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 6);

export function generateRoomId() {
  return `party-${roomAlphabet()}`;
}

export function generateGuestName() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `Guest_${n}`;
}
