import { widgetResponse } from './widget-api.mjs';
export default async function handler(req,res){
  res.setHeader('Content-Type','application/json');
  if(req.method!=='GET'){res.statusCode=405;res.end(JSON.stringify({error:'Use GET'}));return;}
  try{const value=await widgetResponse(new URL(req.url,'https://www.xbesnard.com'));
    res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');res.end(JSON.stringify(value));
  }catch{res.statusCode=502;res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'The source is temporarily unavailable. Try refresh.'}));}
}
