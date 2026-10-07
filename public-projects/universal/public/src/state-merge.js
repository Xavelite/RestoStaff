// Apply this tab's changes to the newest stored snapshot. Unchanged fields and
// unrelated activity from another open tab survive; deliberate edits win locally.
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function identity(item) {
  if (!object(item)) return null;
  if (item.id != null) return `id:${item.id}`;
  if (item.target && item.userId) return `target:${item.target}:${item.userId}`;
  if (item.postId && item.userId) return `post:${item.postId}:${item.userId}`;
  if (item.collectionId && item.userId) return `collection:${item.owner}:${item.collectionId}:${item.userId}`;
  if (item.from && item.to) return `pair:${item.from}:${item.to}`;
  if (item.userId) return `user:${item.userId}`;
  return null;
}
export function mergeSocial(base, local, remote) {
  if (same(base, local)) return structuredClone(remote);
  if (same(base, remote) || remote === undefined) return structuredClone(local);
  if (object(base) && object(local) && object(remote)) {
    const merged = structuredClone(remote);
    for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
      if (!Object.hasOwn(local,key)) { if (Object.hasOwn(base,key)) delete merged[key]; }
      else merged[key] = mergeSocial(base[key], local[key], remote[key]);
    }
    return merged;
  }
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const items = [...base,...local,...remote];
    if (items.every(item => identity(item))) {
      const maps = [base,local,remote].map(list => new Map(list.map(item => [identity(item),item])));
      const [old, here, latest] = maps;
      const keys = [...latest.keys()].filter(key => !old.has(key) || here.has(key));
      for (const key of here.keys()) if (!keys.includes(key) && (!old.has(key) || !same(old.get(key),here.get(key)))) keys.push(key);
      const localOrderChanged = !same(base.map(identity).filter(key=>here.has(key)),local.map(identity).filter(key=>old.has(key)));
      if (localOrderChanged) {
        const order = new Map(local.map((item,i)=>[identity(item),i]));
        keys.sort((a,b)=>(order.get(a)??Infinity)-(order.get(b)??Infinity));
      }
      return keys.map(key => here.has(key) ? mergeSocial(old.get(key),here.get(key),latest.get(key)) : structuredClone(latest.get(key)));
    }
  }
  return structuredClone(local);
}
