import { publishPost, commentOnPost } from './network.js';
import { canViewCard } from './social.js';
import { uid } from './model.js';
import { catalogCards, catalogCollections } from './catalog.js';

export function upgradeDocumentSample(data) {
  if (data.documentSampleVersion) return false;
  const space = data.spaces.xavier;
  if (!space) return false;
  const sample = catalogCards().find(c => c.id === 'sample-weekend-plans');
  if (!space.cards.some(c => c.fileId === sample.fileId)) {
    if (!space.collections.some(c => c.id === sample.collectionId))
      space.collections.push({ ...catalogCollections.find(c => c.id === sample.collectionId), visibility: 'private' });
    space.cards.push({ ...sample, visibility: 'private' });
  }
  data.documentSampleVersion = 1;
  return true;
}

export function upgradeFinalDemo(data){
  if(data.finalMockupVersion)return false;
  const club=data.spaces.alex?.collections.find(c=>c.id==='alex-rock-club');
  if(club&&!club.checklist)club.checklist=[
    {id:uid(),text:'Pick an opening track for our next listening session',done:false,addedBy:'alex'},
    {id:uid(),text:'Add a forgotten 90s favorite to the collection',done:false,addedBy:'jules'},
  ];
  if(data.profiles.jules&&data.profiles.alex){
    const post=publishPost(data,'jules',{text:'What is one website you keep going back to? Share its card and tell us why it earns a place in your space.',topic:'Everyday life',audience:'public',intent:'question'});
    post.demo=true;post.createdAt=Date.now()-3600000;
    const card=data.spaces.alex.cards.find(c=>c.type==='link'&&canViewCard(data,'alex',c,null));
    if(card){const comment=commentOnPost(data,'alex',post.id,'One for your collection. Open the card to explore it, or save it for later.',null,{kind:'card',owner:'alex',id:card.id});comment.createdAt=post.createdAt+300000;}
  }
  const space=data.spaces.xavier,c=space?.collections.find(c=>/work|learn|everyday/i.test(c.name)&&!c.system);
  if(c&&!space.cards.some(card=>card.widget==='continue'))space.cards.push({id:uid(),type:'widget',widget:'continue',title:'Continue & revisit',collectionId:c.id,color:'violet',visibility:'private',createdAt:Date.now()});
  data.finalMockupVersion=1;return true;
}
