import { seedState, uid } from './model.js';
import { createSmartCollection } from './smart-collections.js';
import { syncResources } from './social.js';

// Start from shipped examples only, never another visitor's files or app links.
export function createDemoSpace(data) {
  const id='guest-'+uid();
  const number=Object.values(data.profiles).filter(p=>p.guestDemo).length+1;
  const name=number===1?'Guest':'Guest '+number;
  const space=seedState(), now=Date.now();
  space.settings={...space.settings,name,theme:'dark',view:'adaptive',groupCollections:false,sidebarMode:'auto',foldedCollections:[]};
  space.presentationVersion=1;space.folders=[];space.recentCards=[];
  for(const collection of space.collections){collection.visibility='private';collection.collapsed=false;}
  for(const card of space.cards){card.id=id+'-'+card.id;card.visibility='private';card.createdAt=now-86400000;}
  for(const [widget,title,collectionId,color,options] of [
    ['crypto','Bitcoin','finance','amber',{quoteCurrency:'EUR'}],
    ['currency','Currency converter','finance','sage',{baseCurrency:'EUR',quoteCurrency:'USD',amount:100}],
    ['news','Today’s headlines','news','blue',{newsSource:'world'}],
    ['continue','Continue & revisit','daily','violet',{}]
  ]){
    const collection=space.collections.find(c=>c.id===collectionId)||space.collections[0];
    space.cards.push({id:uid(),type:'widget',widget,title,collectionId:collection.id,color,url:'',description:'',visibility:'private',createdAt:now,...options});
  }
  for(const [title,rules] of [
    ['80s & 90s rock discoveries',{scope:'everyone',topic:'music',type:'video',genre:'Rock',decades:['1980s','1990s'],sort:'liked',limit:12}],
    ['Gaming discoveries',{scope:'everyone',topic:'gaming',sort:'liked',limit:8}],
    ['The reading shelf',{scope:'everyone',topic:'reading',sort:'liked',limit:8}]
  ])createSmartCollection(space,title,rules);
  data.profiles[id]={name,handle:'guest-'+number,color:'sage',bio:'Exploring a little of everything. A fresh demo space.',demo:true,guestDemo:true};
  data.spaces[id]=space;
  for(const friend of ['alex','jules','nora'])if(data.profiles[friend]){
    data.requests.push({id:uid(),from:friend,to:id,status:'accepted',createdAt:now,demo:true});
    data.follows.push({from:id,to:friend});
  }
  if(data.profiles.alex)(data.messages||=[]).push({id:uid(),from:'alex',to:id,text:'Welcome to your demo space! Try a card, explore the community, or send me a discovery. You can switch demo profiles to reply.',attachment:null,createdAt:now,read:false,demo:true});
  syncResources(data);
  return id;
}
