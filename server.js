import {createServer} from 'node:http';
import {handle} from './lib/handler.js';
const PORT=Number(process.env.PORT||3000);
if(!process.env.SESSION_SECRET&&process.env.DATA_BACKEND!=='google-drive')console.warn('AMBIENTE DE TESTE: SESSION_SECRET efêmero; sessões expiram ao reiniciar.');
createServer(handle).listen(PORT,'127.0.0.1',()=>console.log(`Conexao Talentos Web local: http://127.0.0.1:${PORT}`));
