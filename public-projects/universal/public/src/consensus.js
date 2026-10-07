import { resolveTopic, subjectIds } from './topics.js';

export const CATEGORY_RULES={minimum:3,share:.6,lead:2};
export function categoryBallot(data,key) {
  const byPerson=new Map();
  for(const vote of data.categoryVotes||[]){
    if(vote.key!==key||!data.profiles[vote.userId]||data.profiles[vote.userId].role==='curator')continue;
    const previous=byPerson.get(vote.userId);
    if(!previous||(vote.updatedAt||0)>=(previous.updatedAt||0))byPerson.set(vote.userId,vote);
  }
  const votes=[...byPerson.values()].filter(v=>!v.withdrawn&&resolveTopic(v.topicId));
  const counts=new Map();for(const vote of votes)counts.set(vote.topicId,(counts.get(vote.topicId)||0)+1);
  const choices=[...counts].map(([topicId,count])=>({topicId,count})).sort((a,b)=>b.count-a.count||a.topicId.localeCompare(b.topicId));
  const first=choices[0],second=choices[1]?.count||0;
  const winner=first&&votes.length>=CATEGORY_RULES.minimum&&first.count>=CATEGORY_RULES.minimum&&first.count/votes.length>=CATEGORY_RULES.share&&first.count-second>=CATEGORY_RULES.lead?first.topicId:null;
  return {votes,choices,total:votes.length,winner};
}
export function communityCard(data,key,card) {
  const choice=data.communityCategories?.[key]?.topicId;
  if(!choice)return card;
  const initial=data.communityCategories[key].originalSubjects||subjectIds(card);
  return {...card,subjects:[...new Set([choice,...initial.slice(1).filter(id=>id!==choice&&!choice.startsWith(id+'.'))])],communityTopic:choice};
}
export function resolveCategoryDecisions(data,entries,now=Date.now()) {
  data.communityCategories||={};
  for(const [key,entry]of entries){
    const initial=subjectIds(entry.card);
    let current=data.communityCategories[key];
    if(!current){
      const topicId=initial[0]||resolveTopic((entry.card.topics||[])[0])?.id||'';
      current=data.communityCategories[key]={topicId,originalSubjects:initial.length?initial:topicId?[topicId]:[],history:[]};
    }
    const ballot=categoryBallot(data,key);
    if(ballot.winner&&ballot.winner!==current.topicId){
      const previous=current.topicId;
      current.topicId=ballot.winner;current.decidedAt=now;
      current.history=[...(current.history||[]),{from:previous,to:ballot.winner,at:now,support:ballot.choices[0].count,total:ballot.total}].slice(-20);
    }
  }
}
