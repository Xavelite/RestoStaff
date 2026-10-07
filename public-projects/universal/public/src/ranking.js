export const SORTS = { relevant:'Best match', trending:'Trending this week', popular:'Most popular', liked:'Most liked', saved:'Most saved', recent:'Newest' };
export const SORT_HELP = {
  relevant:'Matches your words first, then community popularity.',
  trending:'Recent activity from distinct people over the last 7 days. Newer activity carries more weight.',
  popular:'All-time support: distinct savers × 3, likes, and public recommenders × 2.',
  liked:'Most likes from distinct people. One vote per person.',
  saved:'Most distinct savers visible in your chosen scope. Private saves never enter public counts.',
  recent:'Most recently shared. Engagement does not change this order.',
};
export function recentSupport(events, now=Date.now()) {
  const people=new Map();
  for(const event of events) {
    const age=(now-Number(event.createdAt))/86400000;
    if(!event.userId || !Number.isFinite(age) || age<0 || age>7)continue;
    people.set(event.userId,Math.max(people.get(event.userId)||0,1/(1+age)));
  }
  return { score:[...people.values()].reduce((a,b)=>a+b,0), people:people.size };
}
