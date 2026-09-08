import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedHandler} from '../src/hosted-handler.mjs';
const origin='http://127.0.0.1:5175';
const user={id:'verified-user',email:'owner@example.test',email_confirmed_at:'2026-09-08'};
function setup(authenticate=async token=>token==='valid'?user:null){
 const calls=[];
 const handler=createHostedHandler({authenticate,allowedOrigins:[origin],snapshot:async id=>{calls.push(id);return {clients:[]};},savePost:async (id,input)=>{calls.push(id);return {id:'saved',title:input.title};},act:async()=>{throw new Error('must not schedule');}});
 const req=(path,body,token='valid',requestOrigin=origin)=>handler(new Request(`https://example.test/functions/v1/workspace${path}`,{method:body?'POST':'GET',headers:{origin:requestOrigin,authorization:`Bearer ${token}`},body:body?JSON.stringify(body):undefined}));
 return {calls,req,handler};
}
test('hosted gateway rejects missing, forged and unverified sessions before data access',async()=>{
 const {req,calls,handler}=setup();
 assert.equal((await handler(new Request('https://example.test/functions/v1/workspace/snapshot'))).status,401);
 assert.equal((await req('/snapshot',null,'forged')).status,401);
 assert.equal(calls.length,0);
 assert.equal((await setup(async()=>({...user,email_confirmed_at:null})).req('/snapshot')).status,401);
});
test('hosted gateway uses verified identity and refuses other origins',async()=>{
 const {req,calls}=setup();
 assert.equal((await req('/snapshot',null,'valid','https://untrusted.example')).status,403);
 const res=await req('/posts',{title:'Saved draft',userId:'administrator'});
 assert.equal(res.status,201);assert.deepEqual(calls,['verified-user']);
});
test('hosted snapshot labels mode and never schedules without verified provider connections',async()=>{
 const {req}=setup();
 assert.equal((await (await req('/snapshot')).json()).mode,'hosted-preview');
 assert.equal((await req('/posts/11111111-1111-1111-1111-111111111111/action',{action:'schedule',revision:1})).status,409);
});
