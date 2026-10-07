export function steamLink(value) {
  const url = String(value || '').trim();
  return /^steam:\/\/open\/(?:main|library)\/?$/i.test(url) || /^steam:\/\/(?:run|rungameid)\/[1-9]\d{0,19}\/?$/i.test(url) ? url : '';
}
export function validLauncher(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.kind === 'steam') return !!steamLink(value.uri);
  return ['app','file','folder'].includes(value.kind) && /^[a-f\d-]{36}$/i.test(value.targetId || '') && /^[a-f\d-]{36}$/i.test(value.deviceId || '');
}
export const launcherIcon = value => typeof value==='string' && value.length<=40000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) ? value : '';
export function localFileType(file) {
  if (/^(audio\/)/.test(file.type) || /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(file.name)) return 'audio';
  if (/^(video\/)/.test(file.type) || /\.(mp4|webm|mov)$/i.test(file.name)) return 'video';
  return 'file';
}
export const isPicture = file => /^image\/(png|jpeg|gif|webp|avif)$/.test(file.type) || /\.(png|jpe?g|gif|webp|avif)$/i.test(file.name);
export const isExecutable = file => /\.(exe|lnk|bat|cmd|ps1|msi|com|scr|vbs|js|reg|url)$/i.test(file.name);
export const launcherLabel = launcher => ({app:'App on this computer',file:'File on this computer',folder:'Folder on this computer',steam:'Opens in Steam'})[launcher.kind] || 'This computer';
export function shortcutURL(text) {
  if(typeof text!=='string'||text.length>16384)return '';
  const value=text.match(/^URL=(.+)$/im)?.[1]?.trim() || '';
  if(steamLink(value))return value;
  try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:'';} catch{return '';}
}
