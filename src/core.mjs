export const LIMIT=25;
const types={
  hotel:{label:'Hotel / resort',ac:20,dc:8,amen:10},
  supermarket:{label:'Supermercado',ac:8,dc:16,amen:5},
  restaurant:{label:'Restaurante',ac:12,dc:20,amen:10},
  winery:{label:'Adega / turismo',ac:16,dc:12,amen:10},
  attraction:{label:'Parque / lazer',ac:16,dc:16,amen:10}
};
export function cleanCity(input){
 const s=String(input??'').trim().replace(/\s+/g,' ');
 if(!s||s.length>90||!/^[-\p{L}\p{M}\s.',]+$/u.test(s)) throw new Error('Informe uma cidade brasileira válida.');
 return s;
}
export function key(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');}
export function number(v){return Number.isFinite(Number(v))?Number(v):null;}
export function normalizePlace(el){
 const t=el.tags??{},lat=number(el.lat??el.center?.lat),lon=number(el.lon??el.center?.lon);
 if(!t.name||lat===null||lon===null) return null;
 let type=t.tourism==='hotel'||t.tourism==='guest_house'||t.tourism==='motel'?'hotel':
  t.shop==='supermarket'?'supermarket':t.amenity==='restaurant'?'restaurant':
  t.craft==='winery'||t.shop==='wine'?'winery':
  t.tourism==='attraction'||t.tourism==='theme_park'?'attraction':null;
 if(!type)return null;
 const park=/^(yes|customers|designated)$/i.test(t.parking??t['parking:customer']??'')?true:null;
 const street=[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(', ');
 return {id:`${el.type}/${el.id}`,name:t.name,cat:types[type].label,address:street||t['addr:full']||'Endereço a confirmar',zone:t['addr:suburb']||'',coordinates:[lon,lat],parking:park,amen:types[type].amen,charge:'Não apurada',why:`Cadastro ${types[type].label.toLowerCase()} no OpenStreetMap; sinal inicial de prospecção.`,check:'Confirmar operação, endereço, vagas, recarga, gestor e permanência.',sources:['osm'],visit:0,osm:`${el.type}/${el.id}`,origin:'OpenStreetMap'};
}
export function normalizeCharger(el){
 const t=el.tags??{},lat=number(el.lat??el.center?.lat),lon=number(el.lon??el.center?.lon);
 if(lat===null||lon===null)return null;
 return {id:`${el.type}/${el.id}`,name:t.name||t.operator||'Recarga sem nome',coordinates:[lon,lat],access:t.access||'não informado',socket:Object.keys(t).filter(k=>k.startsWith('socket:')&&!k.endsWith(':output')).map(k=>k.slice(7)).join(', ')||'não informado',status:'Cadastro OSM; operação não verificada',url:`https://www.openstreetmap.org/${el.type}/${el.id}`};
}
export function distanceKm(a,b){const rad=Math.PI/180,dLat=(b[1]-a[1])*rad,dLon=(b[0]-a[0])*rad,x=Math.sin(dLat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dLon/2)**2;return 12742*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
export function score(p,scenario='AC',demand=null){
 const kind=Object.values(types).find(v=>v.label===p.cat)||types.attraction;
 const fit=scenario==='DC'?kind.dc:kind.ac;
 const d=Number.isFinite(demand)?25*Math.min(1,demand/1000):0;
 const base=d+fit+(p.parking===true?10:0)+(p.amen??kind.amen);
 const pending=25+10+(p.parking===true?0:10)+(Number.isFinite(demand)?0:25);
 return {low:+base.toFixed(1),high:+Math.min(100,base+pending).toFixed(1),pending,demandKnown:Number.isFinite(demand)};
}
export function surveyRadius(geo){
 const box=geo.boundingbox?.map(Number),lat=Number(geo.lat);
 if(!Array.isArray(box)||box.length!==4||box.some(n=>!Number.isFinite(n))||!Number.isFinite(lat))return 6;
 const northSouth=(box[1]-box[0])*111,eastWest=(box[3]-box[2])*111*Math.cos(lat*Math.PI/180);
 return northSouth<=14&&eastWest<=14?null:6;
}
export function overpassQuery(geo,{radiusKm=null}={}){
 const id=Number(geo.osm_id);
 const area=geo.osm_type==='relation'&&Number.isSafeInteger(id)&&id>0?`(area:${3600000000+id})`:null;
 const box=geo.boundingbox?.map(Number);
 if(!area&&(!Array.isArray(box)||box.length!==4||box.some(n=>!Number.isFinite(n))))throw new Error('Limite municipal indisponível.');
 let scope=area||`(${box[0]},${box[2]},${box[1]},${box[3]})`;
 if(radiusKm!==null){
  const lat=Number(geo.lat),lon=Number(geo.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(radiusKm)||radiusKm<=0||radiusKm>10)throw new Error('Centro municipal indisponível.');
  const dy=radiusKm/111,dx=radiusKm/(111*Math.cos(lat*Math.PI/180));
  scope=`(${(lat-dy).toFixed(5)},${(lon-dx).toFixed(5)},${(lat+dy).toFixed(5)},${(lon+dx).toFixed(5)})`;
 }
 const filters=['["tourism"~"^(hotel|guest_house|motel|attraction|theme_park)$"]','["shop"="supermarket"]','["amenity"="restaurant"]','["craft"="winery"]','["shop"="wine"]','["amenity"="charging_station"]'];
 return `[out:json][timeout:22];(${filters.map(f=>`nwr${f}${scope};`).join('')});out center;`;
}
export function curate(elements){
 const chargers=[],candidates=[],seen=new Set();
 for(const el of elements){
  if(el.tags?.amenity==='charging_station'){const c=normalizeCharger(el);if(c)chargers.push(c);continue;}
  const p=normalizePlace(el);if(!p)continue;
  const dedupe=key(p.name)+':'+p.coordinates.map(x=>x.toFixed(3)).join(':');
  if(seen.has(dedupe))continue;seen.add(dedupe);candidates.push(p);
 }
 candidates.sort((a,b)=>score(b).low-score(a).low||a.name.localeCompare(b.name,'pt-BR'));
 return {candidates:candidates.slice(0,LIMIT),chargers,found:candidates.length};
}
export function publicResult(city,seed){
 const d=seed.abve?.pocos?.plugin??seed.abve?.vinhedo?.plugin??null;
 const verified=Boolean(seed.abve?.pocos?.plugin);
 return {city,kind:'curated',date:seed.date,area:null,candidates:seed.candidates,chargers:[],found:seed.candidates.length,demand:d,demandStatus:verified?'ABVE, consulta do piloto':'Base secundária Carregados; não reconciliada com ABVE',sources:seed.sources,abve:seed.abve,notes:verified?'Recarga na seção de fontes das fichas; operação a validar.':'Relatos de recarga nas fichas; operação a validar.'};
}
