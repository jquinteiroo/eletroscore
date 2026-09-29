import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {cleanCity,key,curate,overpassQuery,publicResult} from './core.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const PORT=Number(process.env.PORT)||3000;
const cache=new Map();
const seeded=new Map([['pocosdecaldas','pocos'],['vinhedo','vinhedo']]);
let nextNominatim=0;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function getJSON(url,options={}){
 const resp=await fetch(url,{...options,signal:AbortSignal.timeout(35000)});
 if(!resp.ok)throw new Error(`Fonte externa indisponível (${resp.status}). Tente novamente mais tarde.`);
 return resp.json();
}
async function analyze(raw){
 const city=cleanCity(raw),k=key(city.split(',')[0]);
 if(seeded.has(k)){
  const seed=JSON.parse(await readFile(path.join(ROOT,'data',`${seeded.get(k)}.json`),'utf8'));
  return publicResult(city,seed);
 }
 const ck=key(city),hit=cache.get(ck);
 if(hit&&hit.expiry>Date.now())return hit.value;
 // Nominatim public server: serialized requests and a server-side cache.
 const delay=Math.max(0,nextNominatim-Date.now());nextNominatim=Math.max(Date.now(),nextNominatim)+1100;
 if(delay)await wait(delay);
 const query=new URLSearchParams({q:`${city}, Brasil`,format:'jsonv2',addressdetails:'1',limit:'5'});
 const matches=await getJSON(`https://nominatim.openstreetmap.org/search?${query}`,{headers:{'User-Agent':'EletroScoreResearch/0.1 (https://github.com/jquinteiroo/eletroscore)','Accept-Language':'pt-BR'}});
 const geo=matches.find(x=>x.address?.country_code==='br'&&['city','town','municipality','administrative'].includes(x.type))??matches.find(x=>x.address?.country_code==='br');
 if(!geo)throw new Error('Cidade não encontrada no Brasil. Inclua a UF, por exemplo: Campinas, SP.');
 const body=new URLSearchParams({data:overpassQuery(geo)});
 const osm=await getJSON('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'EletroScoreResearch/0.1 (https://github.com/jquinteiroo/eletroscore)'},body});
 const places=curate(osm.elements||[]);
 const value={city:geo.display_name.split(',').slice(0,2).join(','),kind:'openstreetmap',date:new Date().toISOString().slice(0,10),area:geo.boundingbox?.map(Number),...places,demand:null,demandStatus:'Municipal ABVE ainda não integrado para esta cidade',sources:{osm:['OpenStreetMap / Overpass','https://www.openstreetmap.org/copyright','Cadastros públicos colaborativos; dados podem estar incompletos ou desatualizados.']},notes:'Nenhum cadastro confirma fluxo, potência disponível ou funcionamento dos carregadores.'};
 cache.set(ck,{value,expiry:Date.now()+24*60*60*1000});
 return value;
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/analyze'){
   const result=await analyze(url.searchParams.get('city'));
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(result));return;
  }
  const rel=path.posix.normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '')||'index.html';
  if(rel.startsWith('..')||rel.includes('\\'))throw new Error('Caminho inválido.');
  const target=path.resolve(ROOT,rel);
  if(!target.startsWith(ROOT+path.sep))throw new Error('Caminho inválido.');
  const content=await readFile(target);
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'public, max-age=3600'});res.end(content);
 }catch(e){const missing=e.code==='ENOENT';res.writeHead(missing?404:400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:missing?'Página não encontrada.':e.message}));}
});
if(process.env.NODE_ENV!=='test')server.listen(PORT,()=>console.log(`EletroScore em http://localhost:${PORT}`));
export {server,analyze};
