import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {cleanCity,key,curate,overpassQuery,publicResult,surveyRadius,municipalDemand,enrichReport} from './core.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const PORT=Number(process.env.PORT)||3000;
const cache=new Map();
const seeded=new Map([['pocosdecaldas',{file:'pocos',uf:'MG'}],['vinhedo',{file:'vinhedo',uf:'SP'}]]);
let nextNominatim=0;
const inFlight=new Map();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function getJSON(url,service,options={}){
 try{
  const resp=await fetch(url,{...options,signal:AbortSignal.timeout(29000)});
  if(!resp.ok){const error=new Error(`${service} retornou ${resp.status}.`);error.status=resp.status;throw error;}
  return await resp.json();
 }catch(error){if(error.name==='TimeoutError'||error.name==='AbortError'){const timeout=new Error(`${service} demorou demais para responder.`);timeout.status=504;throw timeout;}throw error;}
}
async function fetchOverpass(geo,radiusKm,endpoint){
 const body=new URLSearchParams({data:overpassQuery(geo,{radiusKm})});
 return getJSON(endpoint,'Overpass',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'EletroScoreResearch/0.1 (https://github.com/jquinteiroo/eletroscore)'},body});
}
async function collectPlaces(geo){
 const firstRadius=surveyRadius(geo);
 try{
  const osm=await fetchOverpass(geo,firstRadius,'https://overpass-api.de/api/interpreter');
  return {osm,radiusKm:firstRadius};
 }catch(error){
  if(![429,500,502,503,504].includes(error.status)&&!['TypeError','SyntaxError'].includes(error.name))throw new Error(`Consulta Overpass falhou: ${error.message}`);
  try{
   const osm=await fetchOverpass(geo,3,'https://overpass.private.coffee/api/interpreter');
   return {osm,radiusKm:3};
  }catch(second){throw new Error('Os serviços de mapas estão ocupados. Tente novamente em alguns minutos ou abra os pilotos de Vinhedo e Poços de Caldas.');}
 }
}
async function analyze(raw){
 const city=cleanCity(raw),k=key(city.split(',')[0]);
 const pilot=seeded.get(k),requestedUF=city.match(/,\s*([a-z]{2})$/i)?.[1].toUpperCase();
 if(pilot&&(!requestedUF||requestedUF===pilot.uf)){
  const seed=JSON.parse(await readFile(path.join(ROOT,'data',`${pilot.file}.json`),'utf8'));
  return publicResult(city,seed);
 }
 const ck=key(city),hit=cache.get(ck);
 if(hit&&hit.expiry>Date.now())return hit.value;
 if(inFlight.has(ck))return inFlight.get(ck);
 const task=analyzeExternal(city,ck);
 inFlight.set(ck,task);
 try{return await task;}finally{inFlight.delete(ck);}
}
async function analyzeExternal(city,ck){
 // Nominatim public server: serialized requests and a server-side cache.
 const delay=Math.max(0,nextNominatim-Date.now());nextNominatim=Math.max(Date.now(),nextNominatim)+1100;
 if(delay)await wait(delay);
 const query=new URLSearchParams({q:`${city}, Brasil`,format:'jsonv2',addressdetails:'1',limit:'5'});
 let matches;
 try{matches=await getJSON(`https://nominatim.openstreetmap.org/search?${query}`,'Nominatim',{headers:{'User-Agent':'EletroScoreResearch/0.1 (https://github.com/jquinteiroo/eletroscore)','Accept-Language':'pt-BR'}});}catch(error){throw new Error(`Busca da cidade indisponível no Nominatim: ${error.message}`);}
 const geo=matches.find(x=>x.address?.country_code==='br'&&['city','town','municipality','administrative'].includes(x.type))??matches.find(x=>x.address?.country_code==='br');
 if(!geo)throw new Error('Cidade não encontrada no Brasil. Inclua a UF, por exemplo: Campinas, SP.');
 const {osm,radiusKm}=await collectPlaces(geo);
 const places=curate(osm.elements||[]);
 const municipal=municipalDemand(geo);
 const coverage=radiusKm===null?'município cadastrado no OSM':`área central em raio aproximado de ${radiusKm} km; pode incluir municípios vizinhos`;
 const region=geo.address?.['ISO3166-2-lvl4']?.split('-')[1]??({saopaulo:'SP',minasgerais:'MG'})[key(geo.address?.state??'')];
 const abve=municipal?region==='SP'?{sp:178720,campinas:11284,jundiai:3683,valinhos:1885}:{mg:44682,pousoAlegre:630,varginha:353}:undefined;
 const box=geo.boundingbox?.map(Number);
 const area=radiusKm===null&&box?.length===4&&box.every(Number.isFinite)?[box[2],box[0],box[3],box[1]]:null;
 const value=enrichReport({city:geo.display_name.split(',').slice(0,2).join(','),kind:'openstreetmap',date:new Date().toISOString().slice(0,10),area,coverage,...places,demand:municipal?.plugin??null,demandStatus:municipal?`${municipal.source}; ${municipal.period}`:'Municipal ABVE ainda não integrado para esta cidade',abve,sources:{osm:['OpenStreetMap / Overpass','https://www.openstreetmap.org/copyright','Cadastros públicos colaborativos; dados podem estar incompletos ou desatualizados.'],abve:['ABVE Data — Geografia da Eletromobilidade','https://abve.org.br/abve-data/bi-geografia-da-eletromobilidade/','BEV + PHEV, veículos leves, jan/2022–ago/2026; consulta dos pilotos.']},notes:'A busca é uma amostra territorial; nenhum cadastro confirma fluxo, potência disponível ou funcionamento dos carregadores.'});
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
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(content);
 }catch(e){const missing=e.code==='ENOENT';res.writeHead(missing?404:400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:missing?'Página não encontrada.':e.message}));}
});
if(process.env.NODE_ENV!=='test')server.listen(PORT,()=>console.log(`EletroScore em http://localhost:${PORT}`));
export {server,analyze};
