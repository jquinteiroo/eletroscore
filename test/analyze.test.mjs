import {test} from 'node:test';
import assert from 'node:assert/strict';

test('an unresearched city keeps ABVE pending while mapping OSM records',async()=>{
 const previous=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push(String(url));
  const payload=String(url).includes('nominatim')?[{osm_type:'relation',osm_id:123,type:'administrative',address:{country_code:'br'},display_name:'Cidade Teste, SP, Brasil',boundingbox:['-24','-23','-47','-46']}]:{elements:[
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
  assert.match(x.demandStatus,/não integrado/);assert.equal(calls.length,2);
  const cached=await analyze('Cidade Teste, SP');assert.equal(cached,x);assert.equal(calls.length,2);
 }finally{globalThis.fetch=previous;}
});
