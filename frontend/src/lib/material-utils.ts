export function parseTags(input: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const part of input.split(/[\s,，;；\n]+/)) {
    const tag = part.trim().slice(0, 30);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 10) break;
  }
  return tags;
}

export function countCharacters(input: string): number {
  return Array.from(input).length;
}
