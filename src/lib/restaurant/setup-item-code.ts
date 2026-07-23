export function slug(value: string, fallback: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}

export function setupItemCode(name: string, id: string, fallback: 'area' | 'position'): string {
  return slug(name, `${fallback}-${id.slice(0, 8)}`);
}
