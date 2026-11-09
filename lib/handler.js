/** API HTTP nativa Node.js, compatível com Vercel Functions, sem framework. */
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {backend,readDoc,writeDoc} from './storage.js';
import {ensureConfigured,getUsers,saveUsers,newUser,publicUser,verifyPassword,hashPassword,hashRecovery,signSession,sessionCookie,sessionUser,checkCsrf,checkRate} from './auth.js';
import {emptyData,normalize,scoped,find,active,isCurrent,kinds,factors,stages,guid,cleanRecord,assertCompanyLink,audit,scoreAnswers} from './logic.js';
import {renderDiscPDF} from './report.js';
import {previewBulk,commitBulk} from './bulk.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.ico':'image/x-icon'};
const mutLocks=new Map();
async function serialize(key,fn){const prev=mutLocks.get(key)||Promise.resolve();let release;const current=new Promise(resolve=>release=resolve);mutLocks.set(key,current);await prev;try{return await fn();}finally{release();if(mutLocks.get(key)===current)mutLocks.delete(key);}}
const companyId=(u)=>`workspace_${u.workspace}.json`;
const workspace=async u=>normalize(await readDoc(companyId(u),emptyData()));
async function editWorkspace(u,fn){return serialize(companyId(u),async()=>{const db=await workspace(u);const result=await fn(db);await writeDoc(companyId(u),db);return result??{ok:true}})}
function security(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'");}
function respond(res,body,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));}
function err(status,message){return Object.assign(Error(message),{status});}
function must(cond,status,message){if(!cond)throw err(status,message);}
function method(req,expected){must(req.method===expected,405,'Método não permitido.');}
function requireLogin(u){must(!!u,401,'Entre com sua conta para acessar.');}
async function payload(req,maxBytes=15*1024*1024){
 if(req.body && typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;
 const chunks=[];let total=0;
 for await(const chunk of req){total+=chunk.length;if(total>maxBytes)throw err(413,'Conteúdo muito grande.');chunks.push(chunk)}
 const str=Buffer.concat(chunks).toString('utf8');if(!str)return {};
 try{return JSON.parse(str)}catch{throw err(400,'JSON inválido.')}
}
async function rawBody(req,maxBytes=4*1024*1024){
 if(Buffer.isBuffer(req.body))return req.body;
 if(typeof req.body==='string')return Buffer.from(req.body,'utf8');
 const chunks=[];let total=0;
 for await(const c of req){total+=c.length;if(total>maxBytes)throw err(413,'Arquivo muito grande (limite 4 MB na versão web).');chunks.push(c)}
 return Buffer.concat(chunks);
}
function multipart(buffer,ctype){
 const boundary=/boundary=(?:"([^"]+)"|([^;]+))/i.exec(ctype)?.[1]||/boundary=([^;]+)/i.exec(ctype)?.[1];if(!boundary)throw err(400,'Formulário de upload inválido.');
 const bound=Buffer.from('--'+boundary);let ptr=0,out={};
 while(true){const start=buffer.indexOf(bound,ptr);if(start<0)break;let first=start+bound.length;if(buffer.subarray(first,first+2).toString()==='--')break;
 let headEnd=buffer.indexOf(Buffer.from('\r\n\r\n'),first);if(headEnd<0)break;const headers=buffer.subarray(first,headEnd).toString('latin1');const dataStart=headEnd+4;const next=buffer.indexOf(bound,dataStart);if(next<0)break;
 let dataEnd=next;if(buffer.subarray(dataEnd-2,dataEnd).toString()==='\r\n')dataEnd-=2;
 const name=/name="([^"]+)"/.exec(headers)?.[1],filename=/filename="([^"]*)"/.exec(headers)?.[1];
 if(name){out[name]=filename!==undefined?{filename:filename.replace(/[\\/]/g,'').slice(0,200),data:buffer.subarray(dataStart,dataEnd)}:buffer.subarray(dataStart,dataEnd).toString('utf8');}
 ptr=next;
 }return out;
}
function sendFile(res,buffer,type,name=''){res.statusCode=200;res.setHeader('Content-Type',type);if(name)res.setHeader('Content-Disposition',`attachment; filename="${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`);res.end(buffer);}
function csvField(v){const s=String(v??'');return /[;\n\r"]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function csvOutput(rows){return Buffer.from('\ufeff'+rows.map(r=>r.map(csvField).join(';')).join('\r\n'),'utf8');}
function filenameDate(){return new Date().toISOString().slice(0,10).replaceAll('-','');}
function tokenOwner(token,all){
 const workspacePrefix=String(token||'').match(/^([a-zA-Z0-9_-]+)\.([A-Za-z0-9_-]+)$/)?.[1];
 if(workspacePrefix){const u=Object.values(all.users||{}).find(x=>x.workspace===workspacePrefix);if(u)return [u];}
 return Object.values(all.users||{}).slice(0,50);
}
async function findInviteByToken(token,all){
 if(!/^[a-zA-Z0-9_.-]{16,160}$/.test(token))return null;
 for(const u of tokenOwner(token,all)){const db=await workspace(u);const invite=db.convites.find(x=>x.token===token);if(invite)return {u,db,invite};}
 return null;
}
function companyName(db,id){return find(db.empresas,id)?.nome||'Conexão Talentos'}
function csvReport(db,kind){
 const views=scoped(db);if(kind==='disc'){
  return csvOutput([['candidato','processo','criado_em','respondido_em','estado','D','I','S','C','perfil'],...views.convites.map(i=>{const c=find(views.candidatos,i.candidato_id)||{},p=find(views.processos,i.processo_id)||{};return[c.nome||'',p.titulo||'',i.criado_em||'',i.respondido_em||'',i.estado||'',...factors.map(f=>i.scores?.[f]??''),i.perfil||'']})]);
 }
 const cols={vagas:['id','cargo','departamento','solicitante','abertura','prazo','fechamento','responsavel','etapa','situacao','observacoes','origem'],processos:['id','titulo','departamento','funcao','vaga_id','data','observacoes','origem'],candidatos:['id','nome','telefone','email','fonte','processo_id','vaga_id','data','observacoes','origem',...stages]}[kind];
 if(!cols)throw err(400,'Tipo de CSV inválido.');
 return csvOutput([cols,...views[kind].map(x=>cols.map(k=>stages.includes(k)?x.etapas?.[k]||'':x[k]||''))]);
}
async function publicSurvey(req,res,pathname,all){
 const token=decodeURIComponent(pathname.split('/').at(-1));const match=await findInviteByToken(token,all);
 must(match,404,'Convite não encontrado.');const {invite,db}=match;
 must(invite.estado==='Pendente',410,'Este convite já foi utilizado ou revogado.');
 must(!invite.vence_em||Date.parse(invite.vence_em)>Date.now(),410,'Prazo encerrado.');
 if(req.method==='GET'&&pathname.startsWith('/disc/')){
  const c=find(db.candidatos,invite.candidato_id);const conf=JSON.stringify({token,offline:false,name:c?.nome||'Participante',expiry:invite.vence_em}).replace(/</g,'\\u003c');
  let html=await readFile(path.join(root,'public/static/survey.html'),'utf8');html=html.replace('/*__DISC_CONFIG__*/',conf);
  sendFile(res,Buffer.from(html),'text/html; charset=utf-8');return;
 }
 if(req.method==='POST'&&pathname.startsWith('/api/public/disc/')){
  const body=await payload(req,64*1024);
  const result=scoreAnswers(body.answers);
  await editWorkspace(match.u,async d=>{
   const i=d.convites.find(x=>x.token===token);must(i&&i.estado==='Pendente',409,'Convite já concluído ou revogado.');
   must(!i.vence_em||Date.parse(i.vence_em)>Date.now(),410,'Prazo encerrado.');
   Object.assign(i,result,{respostas:body.answers,estado:'Concluído',respondido_em:new Date().toISOString(),participante:String(body.participant||'').slice(0,150)});
   d.historico.push({empresa_id:i.empresa_id,quando:new Date().toISOString(),acao:'teste concluído',tipo:'disc',id:i.id});
  });respond(res,{ok:true,scores:result.scores,perfil:result.perfil});return;
 }
 throw err(405,'Método não permitido.');
}
async function doRoute(req,res){
 ensureConfigured();security(res);
 const parsed=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`),p=parsed.searchParams.get('route')||parsed.pathname;
 // Desenvolvimento: arquivos estáticos servidos do disco; Vercel hospeda public/ automaticamente.
 if(req.method==='GET'&&(p==='/'||p==='/favicon.ico'||p.startsWith('/static/'))){
   const target=p==='/'?'index.html':p==='/favicon.ico'?'favicon.ico':p.slice(1);
   must(!target.includes('..')&&!target.includes('\\'),404,'Arquivo não encontrado.');
   const file=path.join(root,'public',target),ext=path.extname(file);
   try{sendFile(res,await readFile(file),contentTypes[ext]||'application/octet-stream');return;}catch(e){if(e.code==='ENOENT')throw err(404,'Arquivo não encontrado.');throw e;}
 }
 if(p==='/api/health'&&req.method==='GET'){respond(res,{ok:true,service:'Conexão Talentos Web',storage:backend(),version:'2.0.0-beta.1'});return;}
 const all=await getUsers();const u=sessionUser(req,all);
 if(p==='/api/session'&&req.method==='GET'){respond(res,{configured:!!Object.keys(all.users||{}).length,authenticated:!!u,local:backend()==='local',setup_requires_token:!!process.env.ADMIN_SETUP_TOKEN,user:u?publicUser(u):undefined});return;}
 const post=req.method==='POST';if(post&&!p.startsWith('/api/public/disc/'))checkCsrf(req);
 if(p==='/api/setup'){
  method(req,'POST');checkRate(req,'setup',5);
  const body=await payload(req,20*1024);
  const result=await serialize('users.json',async()=>{
   const users=await getUsers();must(!Object.keys(users.users||{}).length,409,'Administrador já foi criado.');
   if(process.env.ADMIN_SETUP_TOKEN)must(body.setup_token===process.env.ADMIN_SETUP_TOKEN,403,'Código de implantação inválido.');
   const {user,recovery_code}=newUser({username:'admin',name:'Administrador',password:body.senha,role:'admin'});
   await writeDoc(companyId(user),emptyData());users.users.admin=user;await saveUsers(users);return {user,recovery_code};
  });res.setHeader('Set-Cookie',sessionCookie(signSession(result.user),req));respond(res,{ok:true,recovery_code:result.recovery_code});return;
 }
 if(p==='/api/login'){
   method(req,'POST');checkRate(req,'login',18);const q=await payload(req,20*1024);
   const login=String(q.usuario||'admin').trim().toLowerCase();const user=all.users?.[login];
   // Derivação de senha fictícia para contas inexistentes: reduz vazamento temporal trivial.
   const valid=user?verifyPassword(q.senha,user.hash):verifyPassword(q.senha,'scrypt:11112222333344445555666677778888:6'.repeat(64));
   must(valid&&user,401,'Usuário ou senha incorretos.');
   res.setHeader('Set-Cookie',sessionCookie(signSession(user),req));respond(res,{ok:true});return;
 }
 if(p==='/api/recover'){
   method(req,'POST');checkRate(req,'recover',6);const q=await payload(req,20*1024),login=String(q.usuario||'').trim().toLowerCase();
   const result=await serialize('users.json',async()=>{
    const users=await getUsers(),target=users.users?.[login];
    must(target&&target.recoveryHash&&verifyPassword(q.codigo,target.recoveryHash),401,'Usuário ou chave de recuperação inválidos.');
    target.hash=hashPassword(q.senha);target.sessionVersion=(target.sessionVersion||0)+1;
    const {newCode,hashRecovery}=await import('./auth.js');const code=newCode();target.recoveryHash=hashRecovery(code);await saveUsers(users);return {code};
   });respond(res,{ok:true,recovery_code:result.code});return;
 }
 if(p==='/api/logout'){method(req,'POST');res.setHeader('Set-Cookie',sessionCookie('',req,true));respond(res,{ok:true});return;}
 if(p.startsWith('/disc/')||p.startsWith('/api/public/disc/')){
   await publicSurvey(req,res,p,all);return;
 }
 requireLogin(u);
 if(p==='/api/data'){method(req,'GET');respond(res,scoped(await workspace(u)));return;}
 if(p==='/api/users'&&req.method==='GET'){
  must(u.role==='admin',403,'Somente o administrador pode gerenciar usuários.');respond(res,{usuarios:Object.values(all.users).map(publicUser).sort((a,b)=>a.username.localeCompare(b.username))});return;
 }
 if(p==='/api/users'&&post){
  must(u.role==='admin',403,'Somente o administrador pode criar usuários.');const q=await payload(req,30*1024);
  const result=await serialize('users.json',async()=>{
   const users=await getUsers();must(Object.keys(users.users||{}).length<50,400,'Limite de 50 usuários.');
   const login=String(q.usuario||'').trim().toLowerCase();must(!users.users[login],409,'Esse usuário já existe.');
   const {user,recovery_code}=newUser({username:login,name:q.nome,password:q.senha});
   await writeDoc(companyId(user),emptyData());users.users[login]=user;await saveUsers(users);return {recovery_code,usuario:login};
  });respond(res,{ok:true,...result,vagas:0,candidatos:0});return;
 }
 if(p==='/api/users/reset'){
  method(req,'POST');must(u.role==='admin',403,'Somente o administrador pode redefinir senhas.');const q=await payload(req,20*1024);
  const result=await serialize('users.json',async()=>{
   const users=await getUsers(),target=users.users?.[q.usuario];must(target,404,'Usuário não encontrado.');
   const {newCode}=await import('./auth.js');const key=newCode();target.hash=hashPassword(q.senha);target.recoveryHash=hashRecovery(key);target.sessionVersion=(target.sessionVersion||0)+1;
   await saveUsers(users);return {recovery_code:key};
  });respond(res,{ok:true,...result});return;
 }
 if(p==='/api/empresas'){
  method(req,'POST');const q=await payload(req,20*1024);
  const result=await editWorkspace(u,d=>{
   const nome=String(q.nome||'').trim(),company=find(d.empresas,q.id);
   if(['create','rename'].includes(q.action))must(nome.length>=2&&nome.length<=110,400,'Nome da empresa precisa ter 2 a 110 caracteres.');
   if(q.action==='create'){
    must(d.empresas.length<100,400,'Limite de 100 empresas.');must(!d.empresas.some(x=>x.nome.toLowerCase()===nome.toLowerCase()),409,'Empresa já cadastrada.');
    const id=guid('emp');d.empresas.push({id,nome});d.config.empresa_ativa=id;
   }else if(q.action==='select'){
    must(company,404,'Empresa não encontrada.');d.config.empresa_ativa=company.id;
   }else if(q.action==='rename'){
    must(company,404,'Empresa não encontrada.');must(!d.empresas.some(x=>x.id!==q.id&&x.nome.toLowerCase()===nome.toLowerCase()),409,'Empresa já cadastrada.');company.nome=nome;
   }else if(q.action==='delete'){
    must(company,404,'Empresa não encontrada.');must(!['vagas','processos','candidatos','convites'].some(k=>d[k].some(x=>x.empresa_id===q.id)),409,'Esta empresa possui dados vinculados e não pode ser excluída.');
    d.empresas=d.empresas.filter(x=>x.id!==q.id);if(active(d)===q.id)d.config.empresa_ativa=d.empresas[0]?.id||'';
   }else throw err(400,'Ação inválida.');return {ok:true,empresa_id:active(d)};
  });respond(res,result);return;
 }
 if(p==='/api/item'){
  method(req,'POST');const q=await payload(req);must(!!kinds[q.kind],400,'Tipo de cadastro inválido.');
  const result=await editWorkspace(u,d=>{
   must(!!active(d),409,'Cadastre e selecione uma empresa.');const rows=d[q.kind];
   if(q.action==='save'){
    const row=cleanRecord(q.kind,q.record||{});row.empresa_id=active(d);assertCompanyLink(d,q.kind,row);
    const main={vagas:'cargo',processos:'titulo',candidatos:'nome'}[q.kind];must(row[main].trim().length>=2,400,`Informe o campo obrigatório: ${main}.`);
    const old=find(rows,q.record?.id);if(q.record?.id)must(old&&isCurrent(d,old),404,'Registro não encontrado nesta empresa.');
    if(old){Object.assign(old,row);if(!row.origem)old.origem=q.record?.origem||old.origem;audit(d,'editado',q.kind,old.id);}else{row.id=guid(kinds[q.kind]);rows.push(row);audit(d,'criado',q.kind,row.id);}
   }else if(q.action==='delete'){
    const row=find(rows,q.id);must(row&&isCurrent(d,row),404,'Registro não encontrado nesta empresa.');
    if(q.kind==='vagas')must(!d.processos.some(x=>x.vaga_id===q.id)&&!d.candidatos.some(x=>x.vaga_id===q.id),409,'Esta vaga possui processos/candidatos vinculados.');
    if(q.kind==='processos')must(!d.candidatos.some(x=>x.processo_id===q.id),409,'Existem candidatos vinculados.');
    if(q.kind==='candidatos')must(!d.convites.some(x=>x.candidato_id===q.id),409,'O candidato possui testes DISC vinculados.');
    d[q.kind]=rows.filter(x=>x.id!==q.id);audit(d,'excluído',q.kind,q.id);
   }else throw err(400,'Ação inválida.');return {ok:true};
  });respond(res,result);return;
 }
 if(p==='/api/disc/create'){
  method(req,'POST');const q=await payload(req,20*1024);
  const result=await editWorkspace(u,d=>{
   const c=find(d.candidatos,q.candidato_id);must(c&&isCurrent(d,c),404,'Candidato não encontrado.');
   const days=Number(q.dias)>0&&Number(q.dias)<=365?Number(q.dias):30;
   const token=u.workspace+'.'+randomBytes(24).toString('base64url');
   const invite={empresa_id:active(d),id:guid('disc'),token,candidato_id:c.id,processo_id:c.processo_id||'',vaga_id:c.vaga_id||'',criado_em:new Date().toISOString(),vence_em:new Date(Date.now()+days*86400000).toISOString(),estado:'Pendente',scores:{},respostas:[]};
   d.convites.push(invite);audit(d,'convite criado','disc',invite.id);return invite;
  });respond(res,result);return;
 }
 if(p==='/api/disc/revoke'||p==='/api/disc/delete'){
  method(req,'POST');const q=await payload(req,20*1024);
  const result=await editWorkspace(u,d=>{
   const i=find(d.convites,q.id);must(i&&isCurrent(d,i),404,'Teste não encontrado.');
   if(p.endsWith('/revoke')){must(i.estado!=='Concluído',400,'Teste concluído deve ser preservado ou excluído explicitamente.');i.estado='Revogado';audit(d,'revogado','disc',q.id);}
   else{d.convites=d.convites.filter(x=>x.id!==q.id);audit(d,'teste excluído','disc',q.id);}
   return {ok:true};
  });respond(res,result);return;
 }
 if(p==='/api/disc/import'){
  method(req,'POST');const q=await payload(req,100*1024),result=scoreAnswers(q.answers);
  const response=await editWorkspace(u,d=>{
   const invite=d.convites.find(x=>x.token===q.token);must(invite&&isCurrent(d,invite),404,'Convite não encontrado nesta empresa.');
   must(invite.estado==='Pendente',409,'Teste já respondido ou revogado.');
   Object.assign(invite,result,{respostas:q.answers,estado:'Concluído',respondido_em:new Date().toISOString(),participante:String(q.participant||'').slice(0,150)});audit(d,'teste importado','disc',invite.id);return {ok:true};
  });respond(res,response);return;
 }
 if(p==='/api/disc/relatorio'){
  method(req,'GET');const d=await workspace(u),i=find(d.convites,parsed.searchParams.get('id'));
  must(i&&isCurrent(d,i)&&i.estado==='Concluído',404,'Resultado DISC concluído não encontrado.');
  const c=find(d.candidatos,i.candidato_id)||{},process=find(d.processos,i.processo_id)||{},v=find(d.vagas,i.vaga_id||c.vaga_id||process.vaga_id)||{};
  const output=renderDiscPDF(i,c,process,v,companyName(d,i.empresa_id));sendFile(res,output,'application/pdf',`Relatorio_Perfil_DISC_${i.id}.pdf`);return;
 }
 if(p==='/offline/'||p.startsWith('/offline/')){
  method(req,'GET');const token=decodeURIComponent(p.slice(9));const d=await workspace(u),i=d.convites.find(x=>x.token===token);
  must(i&&isCurrent(d,i)&&i.estado==='Pendente',404,'Convite não encontrado ou indisponível.');
  const c=find(d.candidatos,i.candidato_id)||{};
  const conf=JSON.stringify({token,offline:true,name:c.nome||'Participante',expiry:i.vence_em}).replace(/</g,'\\u003c');
  const h=(await readFile(path.join(root,'public/static/survey.html'),'utf8')).replace('/*__DISC_CONFIG__*/',conf);
  sendFile(res,Buffer.from(h),'text/html; charset=utf-8',`Teste_DISC_${filenameDate()}.html`);return;
 }
 if(p==='/api/config'){
  method(req,'POST');const q=await payload(req,12*1024);const url=String(q.public_url||'').trim().replace(/\/$/,'');
  if(url)must(/^https:\/\/[a-zA-Z0-9.-]+(?:\/[^?#]*)?$/.test(url),400,'Use um endereço HTTPS público válido.');
  const response=await editWorkspace(u,d=>{d.config.public_url=url;return {ok:true}});respond(res,response);return;
 }
 if(p==='/api/backup'){
  method(req,'GET');const d=await workspace(u);
  sendFile(res,Buffer.from(JSON.stringify(d,null,2)),'application/json; charset=utf-8',`backup_conexao_talentos_${filenameDate()}.json`);return;
 }
 if(p==='/api/restore'){
  method(req,'POST');const q=await payload(req,15*1024*1024);
  must(Number(q.version)>=1&&Array.isArray(q.vagas)&&Array.isArray(q.processos)&&Array.isArray(q.candidatos)&&Array.isArray(q.convites),400,'Backup inválido ou incompleto.');
  must(q.vagas.length<=100000&&q.candidatos.length<=100000&&q.convites.length<=200000,413,'Backup excessivamente grande.');
  const data=normalize(q);data.config.public_url='';
  await serialize(companyId(u),()=>writeDoc(companyId(u),data));respond(res,{ok:true,advisory:'Dados restaurados. Configure novamente o endereço público para o domínio da nova aplicação.'});return;
 }
 if(p==='/api/csv'){
  method(req,'GET');const kind=parsed.searchParams.get('kind')||'';
  const output=csvReport(await workspace(u),kind);sendFile(res,output,'text/csv; charset=utf-8',`${kind}_${filenameDate()}.csv`);return;
 }
 if(p==='/api/candidatos/lote/modelo'){
  method(req,'GET');const output=csvOutput([['Nome','E-mail','Telefone','Fonte','Data da candidatura','Observacoes'],['Maria Exemplo','exemplo@email.com','85999999999','LinkedIn','09/11/2026','Exclua esta linha de exemplo']]);sendFile(res,output,'text/csv; charset=utf-8','modelo_importacao_candidatos.csv');return;
 }
 if(p==='/api/candidatos/lote/preview'){
  method(req,'POST');const buf=await rawBody(req,4*1024*1024);const parts=multipart(buf,String(req.headers['content-type']||''));must(parts.arquivo&&parts.arquivo.data,400,'Selecione um arquivo CSV ou XLSX.');
  const r=previewBulk(await workspace(u),parts.arquivo.data,parts.arquivo.filename,parts.vaga_id,parts.processo_id);respond(res,r);return;
 }
 if(p==='/api/candidatos/lote/import'){
  method(req,'POST');const input=await payload(req,2*1024*1024);
  const result=await editWorkspace(u,d=>commitBulk(d,input));respond(res,result);return;
 }
 throw err(404,'Recurso não encontrado.');
}
export async function handle(req,res){
 try{await doRoute(req,res)}catch(e){
  const status=Number(e.status)||500;
  console.error('[ConexaoTalentos]',status,e.message);
  if(!res.headersSent)respond(res,{erro:status>=500?'Falha no serviço. Verifique a configuração do armazenamento e os logs.':e.message},status);
  else try{res.end()}catch{}
 }
}
