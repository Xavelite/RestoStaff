export function reorderedColumns(
  order: string[],
  source: string,
  target: string,
  after: boolean
): string[] {
  if (!order.includes(source) || !order.includes(target) || source === target) {
    return order;
  }
  const next = order.filter((candidate) => candidate !== source);
  const targetIndex = next.indexOf(target);
  next.splice(targetIndex + (after ? 1 : 0), 0, source);
  return next;
}
