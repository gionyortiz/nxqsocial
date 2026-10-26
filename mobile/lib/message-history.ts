export type ChatMessage = {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; username?: string };
};

// Refreshes, older pages and send responses can overlap. Merge by server ID so
// a delayed refresh cannot erase a sent message or duplicate a received one.
export function mergeMessages<T extends ChatMessage>(existing: T[], incoming: T[]): T[] {
  const rows = new Map(existing.map(item => [item.id, item]));
  incoming.forEach(item => rows.set(item.id, item));
  return [...rows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
