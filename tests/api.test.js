import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {handle} from '../lib/handler.js';

let base='',server,dir,cookie='';
async function call(url,opt={}){
 const headers={...opt.headers};if(cookie)headers.Cookie=cookie;
 let body=opt.body;
 if(body&&!(body instanceof Buffer)&&!(body instanceof Uint8Array)&&typeof body!=='string'){
  body=JSON.stringify(body);headers['Content-Type']='application/json';headers['X-RS-Request']='1';
 }
 const r=await fetch(base+url,{...opt,headers,body,redirect:'manual'});
 const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
 const raw=Buffer.from(await r.arrayBuffer());let json;
 try{json=JSON.parse(raw.toString('utf8'))}catch{}return {r,raw,json};
}
test('Integração completa v2 (cadastro, empresa, etapas, DISC, relatório, lote, usuários e recuperação)',async t=>{
 dir=await mkdtemp(path.join(tmpdir(),'conexao-teste-'));
 Object.assign(process.env,{DATA_BACKEND:'local',DATA_DIR:dir,SESSION_SECRET:'my-test-secret-more-than-thirty-two-characters',ADMIN_SETUP_TOKEN:'internal-test-setup',NODE_ENV:'test'});
 server=createServer(handle);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true})});
 let x=await call('/api/session');assert.equal(x.json.configured,false);
 x=await call('/api/setup',{method:'POST',body:{usuario:'admin',senha:'1234567890ab',setup_token:'wrong'}});assert.equal(x.r.status,403);
 x=await call('/api/setup',{method:'POST',body:{senha:'1234567890ab',setup_token:'internal-test-setup'}});
 assert.equal(x.r.status,200);const adminCode=x.json.recovery_code;assert.ok(adminCode.length>20);
 x=await call('/api/data');assert.deepEqual(x.json.empresas,[]);
 x=await call('/api/empresas',{method:'POST',body:{action:'create',nome:'Amaral & Castro Advocacia'}});assert.equal(x.r.status,200);
 x=await call('/api/item',{method:'POST',body:{kind:'vagas',action:'save',record:{cargo:'Estágio Direito - Acordos',departamento:'Trabalhista',situacao:'Em Andamento',disc_expectativas:{I:2,C:2,S:1,D:1}}}});assert.equal(x.r.status,200);
 x=await call('/api/data');const vaga=x.json.vagas[0].id;
 x=await call('/api/item',{method:'POST',body:{kind:'processos',action:'save',record:{titulo:'Acordos Novembro',departamento:'Trabalhista',vaga_id:vaga,funcao:'Estagiário'}}});assert.equal(x.r.status,200);
 x=await call('/api/data');const processo=x.json.processos[0].id;
 x=await call('/api/item',{method:'POST',body:{kind:'candidatos',action:'save',record:{nome:'Maria Vitória',vaga_id:vaga,processo_id:processo,email:'maria@test.local',etapas:{'Entrevista Inicial':'Aprovado'}}}});assert.equal(x.r.status,200);
 x=await call('/api/data');const cand=x.json.candidatos[0].id;assert.equal(x.json.candidatos[0].etapas['Entrevista Inicial'],'Aprovado');
 x=await call('/api/disc/create',{method:'POST',body:{candidato_id:cand,dias:30}});assert.equal(x.r.status,200);
 const token=x.json.token,id=x.json.id;
 x=await call('/disc/'+encodeURIComponent(token));assert.equal(x.r.status,200);assert.ok(x.raw.toString().includes('Maria Vitória'));
 x=await call('/api/public/disc/'+encodeURIComponent(token),{method:'POST',body:{answers:Array.from({length:20},(_,i)=>({mais:i%2?'C':'I',menos:i%2?'S':'D'})),participant:'Maria Vitória'}});assert.equal(x.r.status,200);
 x=await call('/api/public/disc/'+encodeURIComponent(token),{method:'POST',body:{answers:Array.from({length:20},()=>({mais:'I',menos:'D'}))}});assert.equal(x.r.status,410);
 x=await call('/api/data');assert.equal(x.json.convites[0].estado,'Concluído');
 x=await call('/api/disc/relatorio?id='+id);assert.equal(x.r.status,200);assert.ok(x.raw.toString('latin1').startsWith('%PDF-1.4'));assert.match(x.raw.toString('latin1'),/\/Count 4/);
 x=await call('/api/backup');assert.equal(x.r.status,200);assert.equal(x.json.convites.length,1);
 x=await call('/api/csv?kind=disc');assert.equal(x.r.status,200);assert.ok(x.raw.toString().includes('Maria Vitória'));
 const boundary='---------boundaryLocal';const csv='Nome;E-mail;Telefone\nAna Oliveira;ana@email.com;85999999999\nBruno Costa;bruno@email.com;85922222222\n';
 const buf=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="vaga_id"\r\n\r\n${vaga}\r\n--${boundary}\r\nContent-Disposition: form-data; name="processo_id"\r\n\r\n${processo}\r\n--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="curriculos.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`)]);
 x=await call('/api/candidatos/lote/preview',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary='+boundary,'X-RS-Request':'1'},body:buf});assert.equal(x.r.status,200);assert.equal(x.json.validos,2);
 x=await call('/api/candidatos/lote/import',{method:'POST',body:{vaga_id:vaga,processo_id:processo,registros:x.json.registros}});assert.equal(x.r.status,200);assert.equal(x.json.importados,2);
 x=await call('/api/users',{method:'POST',body:{usuario:'recrutador',nome:'Recrutador Dois',senha:'qwertyuiop789'}});assert.equal(x.r.status,200);assert.ok(x.json.recovery_code);
 await call('/api/logout',{method:'POST',body:{}});cookie='';
 x=await call('/api/login',{method:'POST',body:{usuario:'recrutador',senha:'qwertyuiop789'}});assert.equal(x.r.status,200);
 x=await call('/api/data');assert.equal(x.json.candidatos.length,0);
 await call('/api/logout',{method:'POST',body:{}});cookie='';
 x=await call('/api/recover',{method:'POST',body:{usuario:'admin',codigo:adminCode,senha:'nova-senha-12345'}});assert.equal(x.r.status,200);const rotated=x.json.recovery_code;assert.notEqual(rotated,adminCode);
 x=await call('/api/login',{method:'POST',body:{usuario:'admin',senha:'nova-senha-12345'}});assert.equal(x.r.status,200);
 x=await call('/api/data');assert.equal(x.json.candidatos.length,3);
 x=await call('/api/disc/delete',{method:'POST',body:{id}});assert.equal(x.r.status,200);
 x=await call('/api/data');assert.equal(x.json.convites.length,0);
 x=await call('/api/session');assert.equal(x.json.authenticated,true);
 x=await call('/api/health');assert.equal(x.json.ok,true);
});
