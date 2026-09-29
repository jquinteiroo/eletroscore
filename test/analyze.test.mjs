import {test} from 'node:test';
import assert from 'node:assert/strict';

test('an unresearched city keeps ABVE pending while mapping OSM records',async()=>{
 const previous=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push(String(url));
  const payload=String(url).includes('nominatim')?[{osm_type:'relation',osm_id:123,type:'administrative',address:{country_code:'br'},display_name:'Cidade Teste, SP, Brasil',lat:'-23.5',lon:'-46.5',boundingbox:['-24','-23','-47','-46']}]:{elements:[
   {type:'node',id:1,lat:-23.5,lon:-46.5,tags:{name:'Hotel Centro',tourism:'hotel'}},
   {type:'node',id:2,lat:-23.51,lon:-46.51,tags:{name:'Carga A',amenity:'charging_station',access:'customers'}}
  ]};
  return {ok:true,json:async()=>payload};
 };
 process.env.NODE_ENV='test';
 try{
  const {analyze}=await import('../src/server.mjs');
  const x=await analyze('Cidade Teste, SP');
  assert.equal(x.kind,'openstreetmap');assert.equal(x.candidates.length,1);
  assert.equal(x.chargers.length,1);assert.equal(x.demand,null);
  assert.equal(x.candidates[0].analysis.nearby.within3,1);
  assert.equal(x.candidates[0].analysis.scores.AC.demandKnown,false);
  assert.match(x.demandStatus,/não integrado/);assert.match(x.coverage,/6 km/);assert.equal(calls.length,2);
  const cached=await analyze('Cidade Teste, SP');assert.equal(cached,x);assert.equal(calls.length,2);
 }finally{globalThis.fetch=previous;}
});

test('Overpass 504 retries once with a smaller disclosed area',async()=>{
 const previous=globalThis.fetch,urls=[];
 globalThis.fetch=async url=>{
  urls.push(String(url));
  if(String(url).includes('nominatim'))return {ok:true,json:async()=>[{osm_type:'relation',osm_id:456,type:'administrative',address:{country_code:'br'},display_name:'Cidade Reserva, SP, Brasil',lat:'-23.5',lon:'-46.5',boundingbox:['-24','-23','-47','-46']}]};
  if(String(url).includes('overpass-api.de'))return {ok:false,status:504};
  return {ok:true,json:async()=>({elements:[{type:'node',id:5,lat:-23.5,lon:-46.5,tags:{name:'Mercado Reserva',shop:'supermarket'}}]})};
 };
 process.env.NODE_ENV='test';
 try{
  const {analyze}=await import('../src/server.mjs');
  const result=await analyze('Cidade Reserva, SP');
  assert.equal(result.candidates.length,1);
  assert.match(result.coverage,/3 km/);
  assert.equal(urls.length,3);
  assert.match(urls[2],/private\.coffee/);
 }finally{globalThis.fetch=previous;}
});
