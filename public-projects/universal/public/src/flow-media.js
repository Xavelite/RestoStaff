import { apiReady } from './youtube-player.js';
import { videoSource, escapeHTML as esc } from './model.js';
import { audioEmbed, videoMarkup } from './media.js';
import { getFile } from './storage.js';

let active=null,generation=0;
const positions=new Map();
export function flowMediaState(node){return active&&active.node===node?{state:active.state,muted:active.muted,embed:active.embed}:null;}
function notify(session){
  if(active!==session)return;
  session.node.dataset.playback=session.state;
  session.node.dataset.muted=String(session.muted);
  session.onChange();
}
export function stopFlowMedia(){
  generation++;
  if(!active)return;
  const session=active;active=null;
  const {player,node,url,restore,key}=session;
  if(player){try{const time=player.getCurrentTime();if(Number.isFinite(time))positions.set(key,time);}catch{}try{player.destroy();}catch{}}
  node.querySelectorAll('video,audio').forEach(media=>{if(Number.isFinite(media.currentTime))positions.set(key,media.currentTime);media.pause();media.removeAttribute('src');media.load();});
  if(url)URL.revokeObjectURL(url);
  delete node.dataset.playback;delete node.dataset.muted;
  restore();session.onChange();
}
export function resumeFlowMedia(node){
  const session=active;if(session?.node!==node||session.embed||session.state==='error')return false;
  session.muted=false;
  if(session.player&&session.ready){session.player.unMute();session.player.playVideo();}
  if(session.media){session.media.muted=false;session.media.play().catch(()=>session.blocked());}
  session.state=session.ready?'playing':'loading';session.status('');notify(session);return true;
}
export function pauseFlowMedia(node){
  const session=active;if(session?.node!==node)return;
  if(session.embed){stopFlowMedia();return;}
  session.player?.pauseVideo?.();session.media?.pause();session.state='paused';session.status('Paused');notify(session);
}
export async function playFlowMedia(card,node,restore,{autoplay=false,onChange=()=>{}}={}){
  stopFlowMedia();const token=generation,key=card.id+':'+card.url;
  const session={node,restore,key,onChange,muted:autoplay,state:'loading',ready:false,embed:false};
  active=session;node.classList.add('is-playing');
  const current=()=>active===session&&token===generation&&node.isConnected;
  session.status=text=>{if(current()){const status=node.querySelector('.flow-player-status');if(status)status.textContent=text;}};
  const fallback=()=>{if(current()){session.state='error';session.status('This source could not play here. Try again or open the original.');notify(session);}};
  session.blocked=()=>{if(current()){session.state='blocked';session.status('Your browser paused autoplay. Press Play to continue.');notify(session);}};
  node.innerHTML='<div class="flow-player-stage"></div><p class="flow-player-status" role="status">Loading player…</p>';
  const stage=node.querySelector('.flow-player-stage');notify(session);
  try{
    const source=videoSource(card.url);
    if(source?.provider==='youtube'){
      const YT=await apiReady();if(!current())return;
      const frame=document.createElement('iframe');
      const params=new URLSearchParams({enablejsapi:'1',origin:location.origin,playsinline:'1',rel:'0',autoplay:'0',mute:session.muted?'1':'0',start:String(Math.floor(positions.get(key)||0))});
      frame.src='https://www.youtube.com/embed/'+source.id+'?'+params;
      frame.title=card.title;frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';stage.append(frame);
      session.player=new YT.Player(frame,{events:{
        onReady:e=>{if(!current())return;session.ready=true;if(session.muted)e.target.mute();else e.target.unMute();e.target.playVideo();},
        onError:fallback,onAutoplayBlocked:session.blocked,
        onStateChange:e=>{
          if(!current())return;
          session.muted=e.target.isMuted?.()??session.muted;
          if(e.data===YT.PlayerState.PLAYING){session.state='playing';session.status(session.muted?'Muted preview · turn sound on when you’re ready.':'');}
          else if(e.data===YT.PlayerState.PAUSED){session.state='paused';session.status('Paused');}
          else if(e.data===YT.PlayerState.ENDED){session.state='ended';session.status('That’s the end. Scroll to discover something else.');}
          notify(session);
        },
      }});return;
    }
    const spotify=audioEmbed(card.url);
    if(spotify){session.embed=true;stage.innerHTML='<iframe src="'+esc(spotify)+'" title="Spotify player" allow="autoplay; encrypted-media; fullscreen; picture-in-picture"></iframe>';session.state='playing';session.status('Use the player controls to listen.');notify(session);return;}
    if(source?.provider==='vimeo'){
      session.embed=true;stage.innerHTML=videoMarkup(card.url);const frame=stage.querySelector('iframe');
      if(autoplay){const url=new URL(frame.src);url.searchParams.set('muted','1');frame.src=url.href;}
      session.state='playing';session.status(autoplay?'Muted preview · use the player controls for sound.':'Use the player controls to pause.');notify(session);return;
    }
    let url=card.url;
    if(card.fileId){const file=await getFile(card.fileId);if(!current())return;if(!file)throw Error('Missing file');url=URL.createObjectURL(file);session.url=url;}
    const media=document.createElement(card.type==='audio'?'audio':'video');session.media=media;session.ready=true;
    media.controls=true;media.playsInline=true;media.muted=session.muted;media.defaultMuted=session.muted;media.src=url;media.preload='metadata';
    media.onloadedmetadata=()=>{if(current()&&positions.has(key)&&Number.isFinite(media.duration))media.currentTime=Math.min(positions.get(key),Math.max(0,media.duration-1));};
    media.onplaying=()=>{if(current()){session.state='playing';session.status(media.muted?'Muted preview · turn sound on when you’re ready.':'');notify(session);}};
    media.onpause=()=>{if(current()){session.state=media.ended?'ended':'paused';session.status(media.ended?'That’s the end. Scroll to discover something else.':'Paused');notify(session);}};
    media.onvolumechange=()=>{if(current()){session.muted=media.muted;session.status(media.muted?'Muted preview · turn sound on when you’re ready.':'');notify(session);}};
    media.onerror=fallback;stage.append(media);await media.play().catch(err=>{if(err.name==='NotAllowedError')session.blocked();else fallback();});
  }catch{fallback();}
}
