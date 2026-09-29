import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanCity,normalizePlace,normalizeCharger,score,overpassQuery,curate,publicResult,municipalDemand} from '../src/core.mjs';
import {readFile} from 'node:fs/promises';

test('city input cannot inject Overpass expressions',()=>{
 assert.equal(cleanCity('  Poços   de Caldas, MG '),'Poços de Caldas, MG');
 for(const text of ['','Vinhedo;out body','São Paulo(999)','x'.repeat(91)])assert.throws(()=>cleanCity(text));
 const q=overpassQuery({osm_type:'relation',osm_id:123,boundingbox:['-24','-23','-47','-46']});
 assert.match(q,/area:3600000123/);assert.match(q,/charging_station/);
});
test('missing ABVE and parking widen the score instead of becoming zero',()=>{
 const p=normalizePlace({type:'node',id:12,lat:-23.1,lon:-47.1,tags:{name:'Mercado A',shop:'supermarket'}});
 assert.equal(p.parking,null);
 assert.deepEqual(score(p,'AC',null),{low:13,high:83,pending:70,demandKnown:false});
 assert.deepEqual(score({...p,parking:true},'DC',849),{low:52.2,high:87.2,pending:35,demandKnown:true});
});
test('chargers remain distinct from prospects; no operational claim is inferred',()=>{
 const elements=[{type:'node',id:1,lat:-23,lon:-47,tags:{name:'Hotel A',tourism:'hotel'}},{type:'node',id:2,lat:-23.01,lon:-47.01,tags:{name:'Carregador',amenity:'charging_station',access:'customers'}},{type:'node',id:3,lat:-23,lon:-47,tags:{name:'Hotel A',tourism:'hotel'}}];
 const result=curate(elements);
 assert.equal(result.candidates.length,1);assert.equal(result.chargers.length,1);
 assert.equal(normalizeCharger(elements[1]).status,'Cadastro OSM; operação não verificada');
});
test('a large city samples different uses instead of only high-scoring hotels',()=>{
 const kinds=[...Array(40).fill({tourism:'hotel'}),...Array(12).fill({shop:'supermarket'}),...Array(12).fill({amenity:'restaurant'}),...Array(5).fill({craft:'winery'}),...Array(8).fill({tourism:'attraction'})];
 const elements=kinds.map((tags,id)=>({type:'node',id:id+1,lat:-22.9+id*.0001,lon:-47.1,tags:{...tags,name:`Lugar ${id}`}}));
 const x=curate(elements),cats=new Set(x.candidates.map(p=>p.cat));
 assert.equal(x.candidates.length,25);assert.equal(x.found,elements.length);assert.equal(cats.size,5);
 assert.equal(x.candidates.filter(p=>p.cat==='Hotel / resort').length,5);
});
test('Campinas uses only the dated municipal ABVE reference for São Paulo state',()=>{
 const geo={display_name:'Campinas, SP, Brasil',address:{city:'Campinas',state:'São Paulo','ISO3166-2-lvl4':'BR-SP'}};
 assert.equal(municipalDemand(geo).plugin,11284);
 assert.equal(municipalDemand({...geo,address:{city:'Campinas',state:'Minas Gerais'}}),null);
});
test('the two researched pilots retain their provenance and 20 places each',async()=>{
 const root=new URL('../public/data/',import.meta.url);
 const p=JSON.parse(await readFile(new URL('pocos.json',root)));
 const v=JSON.parse(await readFile(new URL('vinhedo.json',root)));
 assert.equal(publicResult('Poços de Caldas, MG',p).demandStatus,'ABVE, consulta do piloto');
 assert.match(publicResult('Vinhedo, SP',v).demandStatus,/secundária/);
 assert.equal(p.candidates.length,20);assert.equal(v.candidates.length,20);
 assert.equal(new Set(v.candidates.map(x=>x.name)).size,20);
});
