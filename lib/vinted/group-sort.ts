/**
 * Sorts items by their group's index in groupPriority (a group absent from
 * groupPriority sorts after every listed group, ordered among themselves by
 * first appearance in `items`), then by each item's existing relative order
 * within its group — stable, so this never needs to know about position
 * itself, only the order `items` already arrives in.
 */
export function sortByGroupPriority<T extends { groupKey: string }>(items: T[], groupPriority: string[]): T[] {
  const priorityIndex = new Map(groupPriority.map((key, i) => [key, i]));
  const appearanceOrder = new Map<string, number>();
  for (const item of items) {
    if (!appearanceOrder.has(item.groupKey)) appearanceOrder.set(item.groupKey, appearanceOrder.size);
  }

  function rank(key: string): number {
    const listed = priorityIndex.get(key);
    if (listed !== undefined) return listed;
    return groupPriority.length + (appearanceOrder.get(key) ?? 0);
  }

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.groupKey) - rank(b.item.groupKey) || a.index - b.index)
    .map(({ item }) => item);
}
