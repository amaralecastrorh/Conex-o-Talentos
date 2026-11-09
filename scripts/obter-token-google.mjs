/** OAuth 2.0 web local. Execute APENAS no computador do proprietario do Google Drive.
 * Crie um OAuth Client Web com redirect http://127.0.0.1:5178/callback.
 * Nao cole credenciais/refresh token no GitHub ou em chats. */
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';

const clientId=process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret=process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if(!clientId||!clientSecret){console.error('Defina GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET no terminal antes de iniciar.');process.exit(1)}
const port=5178,redirect=`http://127.0.0.1:${port}/callback`,state=randomBytes(24).toString('hex');
const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/drive',access_type:'offline',prompt:'consent',state}))auth.searchParams.set(k,v);
const server=createServer(async(req,res)=>{
 const url=new URL(req.url||'/',redirect);
 if(url.pathname!=='/callback'){res.writeHead(404).end();return;}
 if(url.searchParams.get('state')!==state){res.writeHead(403).end('Estado da autorizacao invalido');return;}
 const code=url.searchParams.get('code');if(!code){res.writeHead(400).end('Google nao retornou o codigo');return;}
 try{
 const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,redirect_uri:redirect,grant_type:'authorization_code'});
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 const json=await r.json();if(!r.ok||!json.refresh_token)throw Error(json.error_description||json.error||'Nao foi retornado refresh_token');
 console.log('\nGOOGLE_OAUTH_REFRESH_TOKEN (SECRETO - COPIE APENAS PARA A VERCEL):\n'+json.refresh_token+'\n');
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<h1>Autorizacao concluida</h1><p>Retorne ao terminal para copiar o token. Nao compartilhe o token.</p>');
 }catch(e){console.error('Erro OAuth:',e.message);res.writeHead(400).end('Falha na autorizacao: '+e.message)}finally{setTimeout(()=>server.close(),1000).unref()}
});
server.listen(port,'127.0.0.1',()=>{console.log('Abra ESTE ENDERECO no navegador do computador para autorizar o acesso:\n'+auth.toString());console.log('\nAguardando retorno do Google em '+redirect)});
setTimeout(()=>{console.error('Tempo de autorizacao expirou.');server.close()},10*60*1000).unref();
