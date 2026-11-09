/** Credenciais e sessões seguras sem senha/sessão no navegador localStorage. */
import {randomBytes,createHmac,scryptSync,timingSafeEqual} from 'node:crypto';
import {readDoc,writeDoc,backend} from './storage.js';

const devSecret=randomBytes(32).toString('hex');
export const secret=()=>process.env.SESSION_SECRET|| (backend()==='local'?devSecret:'');
export function ensureConfigured(){
 if(process.env.VERCEL==='1' && backend()!=='google-drive')throw Error('Vercel exige DATA_BACKEND=google-drive. Armazenamento local nao e persistente.');
 if(backend()==='google-drive'&&(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32))throw Error('Defina SESSION_SECRET seguro na Vercel.');
 if(backend()==='google-drive'&&!process.env.ADMIN_SETUP_TOKEN)throw Error('Defina ADMIN_SETUP_TOKEN seguro na Vercel.');
}
export const usersDefault=()=>({version:2,users:{}});
export const getUsers=()=>readDoc('users.json',usersDefault());
export const saveUsers=(v)=>writeDoc('users.json',v);
export const newCode=()=>randomBytes(30).toString('base64url');
export function hashPassword(password){
 if(typeof password!=='string'||password.length<10||password.length>256)throw Error('A senha deve ter entre 10 e 256 caracteres.');
 const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
}
export function verifyPassword(password,hash){
 if(typeof hash!=='string'||!hash.startsWith('scrypt:'))return false;
 const [_,salt,expected]=hash.split(':');if(!salt||!expected)return false;
 const a=Buffer.from(expected,'hex');if(a.length!==64)return false;
 return timingSafeEqual(scryptSync(String(password||''),salt,64),a);
}
export function hashRecovery(code){const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${scryptSync(String(code||''),salt,64).toString('hex')}`;}
export function signSession(u){
 const data=Buffer.from(JSON.stringify({u:u.username,v:u.sessionVersion||0,exp:Date.now()+12*3600*1000})).toString('base64url');
 const mac=createHmac('sha256',secret()).update(data).digest('base64url');
 return data+'.'+mac;
}
export function sessionCookie(token,req,clear=false){
 const secure=process.env.NODE_ENV==='production'||req.headers['x-forwarded-proto']==='https';
 return `rs_sessao=${clear?'':encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?'0':'43200'}${secure?'; Secure':''}`;
}
export function sessionUser(req,users){
 let token=String(req.headers.cookie||'').split(/;\s*/).find(x=>x.startsWith('rs_sessao='))?.slice(10)||'';
 try{token=decodeURIComponent(token);}catch{return null}
 const parts=token.split('.');if(parts.length!==2||!secret())return null;
 const expected=createHmac('sha256',secret()).update(parts[0]).digest();let submitted;
 try{submitted=Buffer.from(parts[1],'base64url')}catch{return null}
 if(submitted.length!==expected.length||!timingSafeEqual(expected,submitted))return null;
 try{const s=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));const u=users.users?.[s.u];if(!u||s.v!==(u.sessionVersion||0)||!Number.isFinite(s.exp)||s.exp<Date.now())return null;return u;}catch{return null}
}
export function publicUser(u){return {username:u.username,name:u.name,role:u.role,created:u.created};}
export function newUser({username,name,password,role='user'}){
 if(!/^[a-z][a-z0-9_.-]{2,29}$/.test(username))throw Error('Usuário inválido: use 3 a 30 letras minúsculas, números, ponto, traço ou sublinhado.');
 if(!name||String(name).trim().length<2||String(name).trim().length>80)throw Error('Nome de exibição inválido.');
 const code=newCode();
 const u={username,name:String(name).trim(),role,workspace:username==='admin'?'legacy':`ws_${randomBytes(9).toString('hex')}`,hash:hashPassword(password),recoveryHash:hashRecovery(code),sessionVersion:0,created:new Date().toISOString()};
 return {user:u,recovery_code:code};
}
const attempts=new Map();
export function checkRate(req,key,limit=8,windowMs=10*60*1000){
 const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
 const id=key+':'+ip;const now=Date.now();let a=attempts.get(id);if(!a||a.until<now)a={n:0,until:now+windowMs};a.n++;attempts.set(id,a);if(a.n>limit)throw Object.assign(Error('Muitas tentativas. Tente mais tarde.'),{status:429});
 if(attempts.size>6000)attempts.clear();
}
export function checkCsrf(req){
 if(req.headers['x-rs-request']!=='1')throw Object.assign(Error('Requisição não autorizada.'),{status:403});
 const origin=req.headers.origin,host=req.headers.host;
 if(origin){let u;try{u=new URL(origin)}catch{throw Object.assign(Error('Origem inválida.'),{status:403})};if(u.host!==host)throw Object.assign(Error('Origem não autorizada.'),{status:403});}
}
