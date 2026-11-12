export function unfollowedSelectedIds(
  selected: Iterable<number>,
  items: Array<{ id: number; followed_by_account?: boolean | null }>
): number[] {
  const followed = new Set(
    items.filter((item) => item.followed_by_account === true).map((item) => item.id)
  );
  return Array.from(selected).filter((id) => !followed.has(id));
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("size must be positive");
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
