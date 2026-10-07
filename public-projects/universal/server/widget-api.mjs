// Small, key-free sources for the local mockup. No accounts or database needed.
const cache=new Map();
const feeds={world:'https://feeds.bbci.co.uk/news/world/rss.xml',technology:'https://feeds.bbci.co.uk/news/technology/rss.xml',science:'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'};
export async function widgetResponse(url){
  const kind=url.searchParams.get('kind'),base=(url.searchParams.get('base')||'EUR').toUpperCase(),quote=(url.searchParams.get('quote')||'EUR').toUpperCase(),source=url.searchParams.get('source')||'technology';
  if(!['currency','crypto','news'].includes(kind)||!(/^[A-Z]{3}$/.test(base)&&/^[A-Z]{3}$/.test(quote))||!(source in feeds))throw Error('Unknown widget');
  const key=[kind,base,quote,source].join(':'),old=cache.get(key),ttl=kind==='crypto'?60000:600000;
  if(old&&Date.now()-old.at<ttl)return old.value;
  const endpoint=kind==='currency'?`https://api.frankfurter.dev/v2/rate/${base}/${quote}`:kind==='crypto'?`https://api.coinbase.com/v2/prices/BTC-${quote}/spot`:feeds[source];
  let value;
  if(kind==='currency'&&base===quote)value={rate:1,date:new Date().toISOString().slice(0,10),base,quote};
  else {
    const response=await fetch(endpoint,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'UniversalLocalMockup/0.13'}});
    if(!response.ok)throw Error('Source unavailable');
    if(kind==='news')value={xml:await response.text()};
    else{
      const json=await response.json();
      value=kind==='currency'?{rate:Number(json.rate),date:json.date,base,quote}:{amount:Number(json.data?.amount),asOf:Date.now()};
      if(!Number.isFinite(value.rate??value.amount))throw Error('Invalid quote');
    }
  }
  cache.set(key,{value,at:Date.now()});return value;
}
