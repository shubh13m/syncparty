const KEY = 'syncparty:recentRooms';
const MAX = 8;

export function getRecentRooms() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function addRecentRoom(roomId) {
  if (!roomId) return;
  const list = getRecentRooms().filter((r) => r.id !== roomId);
  list.unshift({ id: roomId, lastJoined: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function removeRecentRoom(roomId) {
  const list = getRecentRooms().filter((r) => r.id !== roomId);
  localStorage.setItem(KEY, JSON.stringify(list));
}
