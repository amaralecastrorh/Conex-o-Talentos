/** Persistência compartilhada: Google Drive (produção) ou arquivos locais (testes). */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { createSign } from 'node:crypto';

const localFolder = () => path.resolve(process.env.DATA_DIR || 'data');
const GOOGLE_API = 'https://www.googleapis.com/drive/v3/files';
let cachedToken = { value: '', expires: 0 };
const params = new URLSearchParams({supportsAllDrives:'true'});

function config() {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) throw Error('Configure GOOGLE_DRIVE_FOLDER_ID (pasta autorizada do Google Drive).');
  return process.env.GOOGLE_DRIVE_FOLDER_ID;
}
async function accessToken() {
  if (cachedToken.value && Date.now() + 60_000 < cachedToken.expires) return cachedToken.value;
  let request;
  if (process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) throw Error('Credenciais OAuth Google incompletas.');
    request = new URLSearchParams({client_id:process.env.GOOGLE_OAUTH_CLIENT_ID,client_secret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,refresh_token:process.env.GOOGLE_OAUTH_REFRESH_TOKEN,grant_type:'refresh_token'});
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let cred;
    try { cred=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON); } catch { throw Error('GOOGLE_SERVICE_ACCOUNT_JSON inválido.'); }
    if (!cred.client_email || !cred.private_key) throw Error('Credenciais da conta de serviço incompletas.');
    const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    const now=Math.floor(Date.now()/1000);
    const assertion = `${enc({alg:'RS256',typ:'JWT'})}.${enc({iss:cred.client_email,scope:'https://www.googleapis.com/auth/drive',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500})}`;
    const sig=createSign('RSA-SHA256').update(assertion).sign(cred.private_key).toString('base64url');
    request = new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:assertion+'.'+sig});
  } else { throw Error('Configure autenticação OAuth Google ou uma conta de serviço com Shared Drive.'); }
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:request});
  const data=await response.json().catch(()=>({}));
  if(!response.ok || !data.access_token) throw Error('Falha na autenticação Google Drive: '+(data.error_description||data.error||response.status));
  cachedToken={value:data.access_token,expires:Date.now()+(Number(data.expires_in)||3500)*1000};
  return cachedToken.value;
}
async function driveRequest(url, options={}) {
  let headers={Authorization:'Bearer '+await accessToken(),...(options.headers||{})};
  const res=await fetch(url,{...options,headers});
  if(!res.ok){const body=(await res.text()).slice(0,700);throw Error(`Google Drive ${res.status}: ${body}`);}
  return res;
}
function driveURL(query=''){return GOOGLE_API+(query?'?'+query:'')}
async function findFile(name){
  const f=config();
  const q=`name = '${name.replace(/'/g,"\\'")}' and '${f.replace(/'/g,"\\'")}' in parents and trashed = false`;
  const query=new URLSearchParams({q,fields:'nextPageToken,files(id,name)',pageSize:'100',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
  const res=await driveRequest(driveURL(query));
  const obj=await res.json();
  return obj.files?.[0]?.id || null;
}
async function readDrive(name){
  const id=await findFile(name);
  if(!id)return null;
  return await (await driveRequest(driveURL(`${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`))).json();
}
async function writeDrive(name,value){
  const serialized=JSON.stringify(value);
  let id=await findFile(name);
  if(!id){
    const created=await driveRequest(driveURL(params),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/json',parents:[config()]})});
    id=(await created.json()).id;
    if(!id)throw Error('Google Drive não retornou o identificador do arquivo criado.');
  }
  await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:serialized});
}
export function backend(){return process.env.DATA_BACKEND || 'local';}
export async function readDoc(name, fallback=null){
  if(!/^[a-zA-Z0-9_.-]+\.json$/.test(name))throw Error('Nome de arquivo inválido.');
  if(backend()==='google-drive')return (await readDrive(name))??structuredClone(fallback);
  if(backend()!=='local')throw Error('DATA_BACKEND deve ser local ou google-drive.');
  try {return JSON.parse(await readFile(path.join(localFolder(),name),'utf8'))} catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw e;}
}
export async function writeDoc(name,value){
  if(!/^[a-zA-Z0-9_.-]+\.json$/.test(name))throw Error('Nome de arquivo inválido.');
  if(backend()==='google-drive')return writeDrive(name,value);
  if(backend()!=='local')throw Error('DATA_BACKEND inválido.');
  await mkdir(localFolder(),{recursive:true,mode:0o700});
  const target=path.join(localFolder(),name);const tmp=target+'.tmp.'+process.pid;
  await writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600});await rename(tmp,target);
}
