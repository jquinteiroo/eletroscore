const $=id=>document.getElementById(id);
let report=null,scenario='AC',selected=null;
let streetMap=null,placeLayer=null,mappedReport=null,mapUnavailable=false;
const markerById=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:1});
function score(p){return p.analysis.scores[scenario];}
function candidates(){const q=$('filter').value.toLocaleLowerCase('pt-BR'),cat=$('category').value,rows=report.candidates.filter(p=>(!cat||p.cat===cat)&&(!q||`${p.name} ${p.zone} ${p.address}`.toLocaleLowerCase('pt-BR').includes(q)));return report.kind==='openstreetmap'?rows:rows.sort((a,b)=>score(b).low-score(a).low||a.name.localeCompare(b.name,'pt-BR'));}
function setFeedback(message,error=false){$('feedback').textContent=message;$('feedback').classList.toggle('error',error);}
async function loadCity(city){
 $('city').value=city;setFeedback('Buscando a cidade e organizando as evidências…');$('results').hidden=true;
 try{
  const res=await fetch(`/api/analyze?city=${encodeURIComponent(city)}`);
  const value=await res.json();if(!res.ok)throw new Error(value.error||'Erro ao consultar a cidade.');
  report=value;selected=value.candidates[0]?.id??null;scenario='AC';$('filter').value='';$('category').innerHTML='<option value="">Todas as categorias</option>'+[...new Set(value.candidates.map(p=>p.cat))].sort().map(c=>`<option>${esc(c)}</option>`).join('');
  history.replaceState({},'',`?cidade=${encodeURIComponent(city)}`);
  $('results').hidden=false;setFeedback('');render();$('results').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){setFeedback(e.message,true);}
}
function render(){
 $('result-title').textContent=report.city;
 $('result-meta').textContent=`${report.kind==='curated'?'Piloto pesquisado':'Levantamento automático OSM'} · consulta ${report.date} · ${report.found} locais cadastrados${report.found>report.candidates.length?` (primeiros ${report.candidates.length} exibidos)`:''}${report.coverage?` · ${report.coverage}`:''}`;
 const nReported=report.candidates.filter(p=>p.charge&&p.charge!=='Não apurada').length;
 $('stats').innerHTML=`<div class="stat"><strong>${report.candidates.length}</strong><span>Locais em análise</span><small>Seleção inicial para visita</small></div><div class="stat"><strong>${report.chargers?.length||nReported}</strong><span>Recargas cadastradas</span><small>${report.kind==='curated'?'Relatadas em diretório':'OpenStreetMap; operação incerta'}</small></div><div class="stat"><strong>${Number.isFinite(report.demand)?fmt(report.demand):'—'}</strong><span>Emplacamentos plug-in</span><small>${esc(report.demandStatus)}</small></div><div class="stat"><strong>${report.candidates.filter(p=>p.coordinates).length}</strong><span>Posições no mapa</span><small>Entradas e vagas a confirmar</small></div>`;
 $('caveat').innerHTML=Number.isFinite(report.demand)?`<strong>${report.demandStatus.includes('secundária')?'Indicador municipal secundário':'Demanda municipal ABVE consultada no piloto'}.</strong> ${report.coverage?`Recorte: ${esc(report.coverage)}. `:''}${esc(report.notes)} Emplacamentos não medem visitas; o valor é igual em todos os endereços da cidade.`:`<strong>Demanda ABVE pendente.</strong> A faixa deixa 25 pontos em aberto. ${report.coverage?`Recorte: ${esc(report.coverage)}. `:''}${esc(report.notes)}`;
 $('caveat').innerHTML+=' <strong>Nota exploratória:</strong> adequação e permanência são hipóteses pela categoria, não medições de fluxo. Vagas de cadastro e recargas próximas exigem conferência em campo.';
 if(report.kind==='openstreetmap')$('caveat').innerHTML+=' <strong>Empates são esperados:</strong> quando lugares da mesma categoria não têm vagas ou outros atributos comprovados, recebem a mesma nota. A lista alterna categorias para ampliar a amostra; a posição na lista não é ranking comercial.';
 $('ac').classList.toggle('active',scenario==='AC');$('dc').classList.toggle('active',scenario==='DC');
 renderPlaces();renderDetail();renderRegion();renderChargers();renderMap();
}
function renderPlaces(){const places=candidates();$('places').innerHTML=places.length?places.map((p,i)=>{const s=score(p),near=p.analysis.nearby;return`<button class="place ${p.id===selected?'selected':''}" type="button" data-id="${esc(p.id)}"><span class="index">${String(i+1).padStart(2,'0')}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.cat)} · ${esc(p.zone||p.address)}</small><small>${!near.available?'Inventário próximo pendente':near.mapped?`${near.within3} recarga(s) cadastrada(s) em 3 km`:'Posição pendente para comparar entorno'}</small></span><span class="score">${fmt(s.low)}–${fmt(s.high)}<small> / 100 · ${s.pending} pts pendentes</small></span></button>`}).join(''):'<div class="empty">Nenhum local neste filtro. Tente outro termo.</div>';
 for(const btn of $('places').querySelectorAll('[data-id]'))btn.addEventListener('click',()=>{selected=report.candidates.find(p=>String(p.id)===btn.dataset.id)?.id;renderPlaces();renderDetail();renderMap();focusSelectedMarker();});}
function renderDetail(){
 const p=report.candidates.find(x=>x.id===selected);
 if(!p){$('detail').innerHTML='<p class="empty">Selecione um local da lista.</p>';return;}
 const s=score(p),a=p.analysis,near=a.nearby;
 const links=(p.sources||[]).map(k=>report.sources?.[k]).filter(Boolean).map(src=>`<a href="${esc(src[1])}" target="_blank" rel="noopener">${esc(src[0])} ↗</a>`).join(' · ');
 const nearbyText=!near.available?'Inventário georreferenciado de recargas ainda não integrado neste piloto; consulte os relatos das fichas e valide em campo.':!near.mapped?'Local sem posição verificada; não é possível calcular a distância.':near.nearest.length?`<div class="nearby-stats"><strong>${near.within1}</strong> em 1 km <strong>${near.within3}</strong> em 3 km</div><ul class="nearby-list">${near.nearest.map(c=>`<li><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)} ↗</a><small>${fmt(c.distanceKm)} km em linha reta · ${esc(c.mode||'tipo não informado')} · acesso ${esc(c.access)}</small></li>`).join('')}</ul>`:'Nenhum carregador georreferenciado consta nesta amostra; isso não comprova ausência de recarga.';
 $('detail').innerHTML=`<div class="detail"><h3 class="detail-name">${esc(p.name)}</h3><div class="detail-address">${esc(p.address)}</div><div class="bigscore">${fmt(s.low)}–${fmt(s.high)} / 100</div><div class="detail-address">Faixa exploratória · ${s.pending} pontos em aberto. Categoria e permanência são hipóteses.</div><dl><dt>Demanda municipal</dt><dd>${s.demandKnown?`${fmt(s.demandPoints)} / 25`:'0–25 pendentes'}</dd><dt>Concorrência operacional</dt><dd>0–25 pendentes</dd><dt>Adequação ${scenario} (hipótese)</dt><dd>${s.fit} / 20</dd><dt>Vagas / acesso</dt><dd>${p.parking===true?'10 + 0–10':'0–20 pendentes'}</dd><dt>Permanência (hipótese)</dt><dd>${s.stayPoints} / 10</dd></dl><h4>Por que investigar</h4><p>${esc(p.why||'Cadastro público do estabelecimento; hipótese inicial de prospecção.')}</p><h4>Recargas cadastradas no entorno</h4><div class="nearby-content">${nearbyText}</div><p class="small">Cobertura limitada à fonte e ao recorte da consulta. Cadastro, conector e acesso não confirmam funcionamento.</p><h4>O que sabemos</h4><div class="evidence-list">${a.evidence.map(e=>`<div class="evidence-row"><span>${esc(e.label)} <b class="${e.state==='pendente'||e.state==='posição pendente'?'pending':''}">${esc(e.state)}</b></span><small>${esc(e.detail)}</small>${e.url?`<a href="${esc(e.url)}" target="_blank" rel="noopener">Conferir local no Google Maps ↗</a>`:''}</div>`).join('')}</div>${p.openingHours?`<p class="small"><strong>Horário cadastrado:</strong> ${esc(p.openingHours)} (conferir)</p>`:''}<h4>Validação em campo</h4><ol class="checklist">${a.checks.map(c=>`<li>${esc(c)}</li>`).join('')}</ol>${p.check?`<p class="small"><strong>Nota da pesquisa:</strong> ${esc(p.check)}</p>`:''}${links?`<p class="source-links"><strong>Fontes:</strong> ${links}</p>`:''}${p.osm?`<a href="https://www.openstreetmap.org/${esc(p.osm)}" target="_blank" rel="noopener">Abrir cadastro no mapa ↗</a>`:''}</div>`;
}
function renderRegion(){const a=report.abve;if(!a){$('region-panel').hidden=true;return;}$('region-panel').hidden=false;const state=a.sp?['São Paulo',a.sp]:['Minas Gerais',a.mg],peers=a.sp?[['Campinas',a.campinas],['Jundiaí',a.jundiai],['Valinhos',a.valinhos]]:[['Pouso Alegre',a.pousoAlegre],['Varginha',a.varginha]];$('regional').innerHTML=`<div class="region-total"><strong>${fmt(state[1])}</strong><span>${state[0]} · ABVE</span></div>${peers.map(([name,value])=>`<div class="region-row"><span>${esc(name)}</span><strong>${fmt(value)}</strong></div>`).join('')}<p class="small">BEV + PHEV, 2022 a ago/2026. Escala de emplacamentos; não representa veículos que visitam o local. <a href="https://abve.org.br/abve-data/bi-geografia-da-eletromobilidade/" target="_blank" rel="noopener">Painel ABVE ↗</a></p>`;}
function renderChargers(){const cards=report.chargers?.length?report.chargers.map(c=>`<div class="charger"><strong>${esc(c.name)}</strong><small>${esc(c.mode||'tipo não informado')} · acesso: ${esc(c.access)} · conector: ${esc(c.socket)} · operação não verificada</small><a href="${esc(c.url)}" target="_blank" rel="noopener">Ver cadastro ↗</a></div>`):report.candidates.filter(p=>p.charge&&p.charge!=='Não apurada').map(p=>`<div class="charger"><strong>${esc(p.name)}</strong><small>${esc(p.charge)} · confirmar acesso e funcionamento</small></div>`);$('chargers').innerHTML=cards?.length?cards.join(''):'<p class="empty">Nenhum ponto consta nesta fonte. Isso não comprova ausência de recarga na cidade.</p>';}
function renderMap(){
 const missing=report.candidates.filter(p=>!p.coordinates).length;
 $('map-count').textContent=`${report.candidates.length-missing} de ${report.candidates.length} locais com posição; ${missing} sem posição verificada. `;
 if(window.L&&!mapUnavailable){renderStreetMap();return;}
 $('street-map').hidden=true;$('map').style.display='block';
 $('map-mode').textContent='Mapa esquemático: a base de ruas não carregou. Posições cadastrais aproximadas.';
 renderSvgMap();
}
function validPosition(coord){return Array.isArray(coord)&&coord.length===2&&Number.isFinite(coord[0])&&Number.isFinite(coord[1])&&Math.abs(coord[0])<=180&&Math.abs(coord[1])<=90;}
function markerStyle(active=false,charger=false){return{radius:active?12:9,color:'#fff',weight:2,fillColor:charger?'#4b78a2':active?'#174c36':'#287a59',fillOpacity:1};}
function placePopup(p){return `<strong>${esc(p.name)}</strong><br>${esc(p.cat)} · ${esc(p.zone||p.address)}<br>Faixa: ${fmt(score(p).low)}–${fmt(score(p).high)} / 100`;}
function updateMarkerStyles(){for(const [id,marker] of markerById)marker.setStyle(markerStyle(id===String(selected)));}
function focusSelectedMarker(){const marker=markerById.get(String(selected));if(streetMap&&marker){streetMap.panTo(marker.getLatLng());marker.openPopup();}}
function renderStreetMap(){
 $('street-map').hidden=false;$('map').style.display='none';
 $('map-mode').textContent='Arraste para mover; use + e − para aproximar. Posições cadastrais aproximadas.';
 if(!streetMap){
  streetMap=L.map('street-map',{scrollWheelZoom:false}).setView([-15,-51],5);
  let tilesLoaded=false,tileErrors=0;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'})
   .on('tileload',()=>{tilesLoaded=true;})
   .on('tileerror',()=>{if(!tilesLoaded&&++tileErrors>=3){mapUnavailable=true;renderMap();}})
   .addTo(streetMap);
  placeLayer=L.layerGroup().addTo(streetMap);
 }
 requestAnimationFrame(()=>streetMap.invalidateSize());
 if(mappedReport===report){updateMarkerStyles();for(const p of report.candidates)markerById.get(String(p.id))?.setPopupContent(placePopup(p));return;}
 mappedReport=report;placeLayer.clearLayers();markerById.clear();
 const bounds=[];
 for(const p of report.candidates){
  if(!validPosition(p.coordinates))continue;
  const [lon,lat]=p.coordinates,marker=L.circleMarker([lat,lon],markerStyle(p.id===selected));
  marker.bindPopup(placePopup(p));
  marker.on('click',()=>{selected=p.id;renderPlaces();renderDetail();updateMarkerStyles();});
  marker.addTo(placeLayer);markerById.set(String(p.id),marker);bounds.push([lat,lon]);
 }
 for(const c of report.chargers||[]){
  if(!validPosition(c.coordinates))continue;
  const [lon,lat]=c.coordinates,marker=L.circleMarker([lat,lon],markerStyle(false,true));
  marker.bindPopup(`<strong>${esc(c.name)}</strong><br>${esc(c.mode||'tipo não informado')} · acesso ${esc(c.access)}<br>Operação não verificada`);
  marker.addTo(placeLayer);bounds.push([lat,lon]);
 }
 if(bounds.length>1)streetMap.fitBounds(bounds,{padding:[36,36],maxZoom:14});
 else if(bounds.length)streetMap.setView(bounds[0],13);
 else if(report.area?.length===4)streetMap.setView([(report.area[1]+report.area[3])/2,(report.area[0]+report.area[2])/2],12);
 else streetMap.setView([-15,-51],5);
}
function renderSvgMap(){const svg=$('map');svg.replaceChildren();const entries=[...report.candidates.filter(p=>p.coordinates).map(p=>({p,coord:p.coordinates})),...(report.chargers||[]).map(c=>({c,coord:c.coordinates}))];const NS='http://www.w3.org/2000/svg',add=(tag,attrs,parent=svg)=>{const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);parent.append(el);return el;};add('rect',{width:800,height:480,fill:'#eaf0e5'});let coords=entries.map(e=>e.coord);if(report.area?.length===4)coords.push([report.area[2],report.area[0]],[report.area[3],report.area[1]]);if(!coords.length){const t=add('text',{x:400,y:240,'text-anchor':'middle',fill:'#668376'});t.textContent='Nenhuma posição cadastrada';return;}const xs=coords.map(c=>c[0]),ys=coords.map(c=>c[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),wx=Math.max(.015,maxX-minX),wy=Math.max(.012,maxY-minY);const scale=Math.min(730/wx,405/wy),cx=(minX+maxX)/2,cy=(minY+maxY)/2,project=([x,y])=>[400+(x-cx)*scale,240-(y-cy)*scale];for(let i=1;i<5;i++){const x=i*160,y=i*96;add('path',{d:`M${x} 0V480 M0 ${y}H800`,stroke:'#dce6d8','stroke-width':1});}for(const e of entries){const [x,y]=project(e.coord);if(x<12||x>788||y<12||y>468)continue;const group=add('g',{class:'dot',tabindex:0,role:'button','aria-label':e.p?e.p.name:e.c.name});add('circle',{cx:x,cy:y,r:e.p?.id===selected?13:10,fill:e.p?'#287a59':'#4b78a2',stroke:'#fff','stroke-width':2},group);const title=add('title',{},group);title.textContent=e.p?.name||e.c.name;if(e.p){group.addEventListener('click',()=>{selected=e.p.id;renderPlaces();renderDetail();renderMap();});group.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();group.dispatchEvent(new Event('click'));}});}}}
$('city-form').addEventListener('submit',e=>{e.preventDefault();loadCity($('city').value);});document.querySelectorAll('[data-city]').forEach(b=>b.addEventListener('click',()=>loadCity(b.dataset.city)));
$('filter').addEventListener('input',renderPlaces);$('category').addEventListener('change',renderPlaces);
for(const m of ['ac','dc'])$(m).addEventListener('click',()=>{scenario=m.toUpperCase();if(report)render();});
$('export').addEventListener('click',()=>{if(!report)return;const payload={...report,scenario,scored:report.candidates.map(p=>({...p,score:score(p)}))};const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));link.download=`eletroscore-${report.city.split(',')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]+/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);});
const initial=new URLSearchParams(location.search).get('cidade');if(initial)loadCity(initial);
window.addEventListener('load',()=>{if(report&&window.L)renderMap();});
