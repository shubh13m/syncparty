// Deterministic pastel color for a user, keyed off their UID or name.
const PALETTE = [
  '#f472b6', '#fb923c', '#facc15', '#a3e635', '#34d399',
  '#22d3ee', '#60a5fa', '#818cf8', '#c084fc', '#f87171',
];

export function colorForKey(key) {
  if (!key) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
