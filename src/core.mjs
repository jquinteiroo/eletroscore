export const LIMIT=25;
const types={
  hotel:{label:'Hotel / resort',ac:20,dc:8,amen:10},
  mall:{label:'Shopping',ac:16,dc:16,amen:10},
  supermarket:{label:'Supermercado',ac:8,dc:16,amen:5},
  restaurant:{label:'Restaurante',ac:12,dc:20,amen:10},
  winery:{label:'Adega / turismo',ac:16,dc:12,amen:10},
  attraction:{label:'Parque / lazer',ac:16,dc:16,amen:10},
  fuel:{label:'Posto / parada',ac:6,dc:20,amen:5}
};
export function cleanCity(input){
 const s=String(input??'').trim().replace(/\s+/g,' ');
 if(!s||s.length>90||!/^[-\p{L}\p{M}\s.',]+$/u.test(s)) throw new Error('Informe uma cidade brasileira válida.');
 return s;
}
export function key(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');}
const abveSnapshot={
 'SP:campinas':11284,'SP:jundiai':3683,'SP:valinhos':1885,
 'MG:pousoalegre':630,'MG:varginha':353
};
export function municipalDemand(geo){
 const city=geo.address?.city??geo.address?.town??geo.address?.municipality??geo.display_name?.split(',')[0]??'';
 const code=geo.address?.['ISO3166-2-lvl4']?.split('-')[1]??
  ({saopaulo:'SP',minasgerais:'MG'})[key(geo.address?.state??'')];
 const plugin=abveSnapshot[`${code}:${key(city)}`];
 if(!Number.isFinite(plugin))return null;
 return {plugin,period:'jan/2022–ago/2026',source:'ABVE Data — Geografia da Eletromobilidade; consulta dos pilotos em 28/09/2026'};
}
export function number(v){return Number.isFinite(Number(v))?Number(v):null;}
export function normalizePlace(el){
 const t=el.tags??{},lat=number(el.lat??el.center?.lat),lon=number(el.lon??el.center?.lon);
 if(!t.name||lat===null||lon===null) return null;
 let type=t.tourism==='hotel'||t.tourism==='guest_house'||t.tourism==='motel'?'hotel':
  t.shop==='mall'?'mall':
  t.shop==='supermarket'?'supermarket':t.amenity==='restaurant'?'restaurant':
  t.amenity==='fuel'?'fuel':
  t.craft==='winery'||t.shop==='wine'?'winery':
  t.tourism==='attraction'||t.tourism==='theme_park'?'attraction':null;
 if(!type)return null;
 const park=/^(yes|customers|designated)$/i.test(t.parking??t['parking:customer']??'')?true:null;
 const street=[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(', ');
 return {id:`${el.type}/${el.id}`,name:t.name,cat:types[type].label,address:street||t['addr:full']||'Endereço a confirmar',zone:t['addr:suburb']||'',coordinates:[lon,lat],parking:park,amen:types[type].amen,openingHours:t.opening_hours||null,charge:'Não apurada',why:`Cadastro ${types[type].label.toLowerCase()} no OpenStreetMap; sinal inicial de prospecção.`,check:'Confirmar operação, endereço, vagas, recarga, gestor e permanência.',sources:['osm'],visit:0,osm:`${el.type}/${el.id}`,origin:'OpenStreetMap'};
}
export function normalizeCharger(el){
 const t=el.tags??{},lat=number(el.lat??el.center?.lat),lon=number(el.lon??el.center?.lon);
 if(lat===null||lon===null)return null;
 const sockets=Object.keys(t).filter(k=>/^socket:[^:]+$/.test(k)&&t[k]!=='no').map(k=>k.slice(7));
 const isDC=s=>/combo|chademo|supercharger|ccs|nacs/i.test(s);
 const dc=sockets.some(isDC);
 const ac=sockets.some(s=>!isDC(s)&&/type[12]|schuko|cee|domestic/i.test(s));
 return {id:`${el.type}/${el.id}`,name:t.name||t.operator||'Recarga sem nome',coordinates:[lon,lat],access:t.access||'não informado',socket:sockets.join(', ')||'não informado',mode:dc&&ac?'AC + DC':dc?'DC':ac?'AC':'não informado',status:'Cadastro OSM; operação não verificada',url:`https://www.openstreetmap.org/${el.type}/${el.id}`};
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
export function nearbyChargers(p,chargers=[]){
 if(!Array.isArray(p.coordinates)||p.coordinates.length!==2||p.coordinates.some(v=>!Number.isFinite(v)))return {mapped:false,within1:null,within3:null,nearest:[]};
 const ranked=chargers.filter(c=>Array.isArray(c.coordinates)&&c.coordinates.length===2&&c.coordinates.every(Number.isFinite))
  .map(c=>({charger:c,distance:distanceKm(p.coordinates,c.coordinates)}))
  .sort((a,b)=>a.distance-b.distance);
 return {mapped:true,within1:ranked.filter(x=>x.distance<=1).length,within3:ranked.filter(x=>x.distance<=3).length,nearest:ranked.slice(0,3).map(x=>({...x.charger,distanceKm:+x.distance.toFixed(2)}))};
}
export function analyzePlace(p,report){
 const kind=Object.values(types).find(v=>v.label===p.cat)||types.attraction;
 const demand=Number.isFinite(report.demand)?report.demand:null;
 const options=Object.fromEntries(['AC','DC'].map(mode=>{
  const points=score(p,mode,demand);
  return [mode,{...points,fit:mode==='AC'?kind.ac:kind.dc,demandPoints:demand===null?null:+(25*Math.min(1,demand/1000)).toFixed(1),parkingPoints:p.parking===true?10:0,stayPoints:p.amen??kind.amen}];
 }));
 const context={...nearbyChargers(p,report.chargers),available:report.kind!=='curated'};
 const pilot=report.kind==='curated';
 const ownCharge=Boolean(p.charge&&p.charge!=='Não apurada');
 const mapsUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name,p.address==='Endereço a confirmar'?'':p.address,report.city].filter(Boolean).join(', '))}`;
 const evidence=[
  {label:'Demanda municipal',state:demand===null?'pendente':report.demandStatus?.includes('secundária')?'estimativa secundária':'dado municipal datado',detail:demand===null?'Sem dado municipal BEV + PHEV integrado.':report.demandStatus},
  {label:'Endereço e posição',state:p.coordinates?'posição cadastrada':'posição pendente',detail:p.coordinates?'Posição aproximada; confirmar entrada e vagas no local.':'Confirmar endereço e geocodificar entrada.'},
  {label:'Estacionamento',state:p.parking===true?'documentado':'pendente',detail:p.parking===true?`${pilot?'Fonte da ficha':'Tag do OpenStreetMap'} indica estacionamento; confirmar acesso e vagas.`:'Não há evidência suficiente de vagas próprias.'},
  {label:'Movimento e horários de pico',state:'pendente',detail:'Sem contagem de visitantes. Consulte no Google Maps se há horários de pico para este local; o gráfico é relativo ao pico da própria semana e pode não estar disponível.',url:mapsUrl},
  {label:'Recarga e concorrência',state:ownCharge?'relato na ficha':context.available&&context.mapped?'cadastros próximos':'pendente',detail:ownCharge?`${p.charge}; confirmar acesso e funcionamento.`:!context.available?'Inventário georreferenciado de recargas não integrado neste piloto.':context.mapped?`${context.within3} cadastro(s) em até 3 km nesta fonte e neste recorte; acesso e operação não verificados.`:'Posição do local indisponível para cálculo de distância.'},
  {label:'Viabilidade elétrica',state:'pendente',detail:'Potência, ligação, obras e custo dependem de vistoria.'}
 ];
 const checks=[!p.coordinates?'Confirmar endereço e localizar a entrada de veículos.':'Confirmar entrada e posição das vagas.',
  p.parking===true?'Confirmar quantidade, acesso e gestão das vagas.':'Verificar se há vagas próprias ou conveniadas.',
  'Conferir horários de pico no Google Maps, se disponíveis, e medir circulação em dias e horários representativos.',
  'Verificar recargas próximas, funcionamento, preços e acesso.',
  'Consultar responsável e avaliar capacidade elétrica e custo de instalação.'];
 return {scores:options,nearby:context,evidence,checks};
}
export function enrichReport(report){
 return {...report,candidates:report.candidates.map(p=>({...p,analysis:analyzePlace(p,report)}))};
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
 const filters=['["tourism"~"^(hotel|guest_house|motel|attraction|theme_park)$"]','["shop"~"^(supermarket|mall)$"]','["amenity"~"^(restaurant|fuel)$"]','["craft"="winery"]','["shop"="wine"]','["amenity"="charging_station"]'];
 return `[out:json][timeout:22];(${filters.map(f=>`nwr${f}${scope};`).join('')});out center;`;
}
export function curate(elements){
 const chargers=[],candidates=[],seen=new Set();
 for(const el of elements){
  if(el.tags?.amenity==='charging_station'){const c=normalizeCharger(el);if(c)chargers.push(c);continue;}
  const p=normalizePlace(el);if(!p)continue;
  const dedupe=p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')+':'+p.coordinates.map(x=>x.toFixed(3)).join(':');
  if(seen.has(dedupe))continue;seen.add(dedupe);candidates.push(p);
 }
 // Reservar espaço para usos distintos; uma cidade com muitos hotéis não deve
 // preencher as 25 fichas antes de supermercados, restaurantes e atrações.
 const categories=Object.values(types).map(t=>t.label),buckets=categories.map(cat=>
  candidates.filter(p=>p.cat===cat).sort((a,b)=>Number(b.parking===true)-Number(a.parking===true)||Number(b.address!=='Endereço a confirmar')-Number(a.address!=='Endereço a confirmar')||a.name.localeCompare(b.name,'pt-BR')));
 const chosen=[];
 while(chosen.length<LIMIT&&buckets.some(b=>b.length)){
  for(const bucket of buckets){if(bucket.length&&chosen.length<LIMIT)chosen.push(bucket.shift());}
 }
 return {candidates:chosen,chargers,found:candidates.length};
}
export function publicResult(city,seed){
 const d=seed.abve?.pocos?.plugin??seed.abve?.vinhedo?.plugin??null;
 const verified=Boolean(seed.abve?.pocos?.plugin);
 return enrichReport({city,kind:'curated',date:seed.date,area:null,candidates:seed.candidates,chargers:[],found:seed.candidates.length,demand:d,demandStatus:verified?'ABVE, consulta do piloto':'Base secundária Carregados; não reconciliada com ABVE',sources:seed.sources,abve:seed.abve,notes:verified?'Recarga na seção de fontes das fichas; operação a validar.':'Relatos de recarga nas fichas; operação a validar.'});
}
