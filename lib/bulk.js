/** Parser CSV/XLSX pequeno para manter importação sem dependências externas. */
import {inflateRawSync} from 'node:zlib';
import {find,isCurrent,active,guid,audit} from './logic.js';
export const limitRows=2000;
function plain(s){return String(s||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
const mapHeaders={nome:'nome',nomecompleto:'nome',nomecandidato:'nome',candidato:'nome',candidata:'nome',email:'email',enderecodeemail:'email',telefone:'telefone',celular:'telefone',whatsapp:'telefone',fone:'telefone',contato:'telefone',origem:'fonte',fonte:'fonte',canal:'fonte',data:'data',datadacandidatura:'data',datadeinscricao:'data',observacao:'observacoes',observacoes:'observacoes',comentarios:'observacoes',comentario:'observacoes',notas:'observacoes'};
function parseCSV(buffer){
 const text=buffer.toString('utf8').replace(/^\ufeff/,'');const first=text.split(/\r?\n/)[0];const sep=[';',',','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 const rows=[];let row=[],field='',quote=false;
 for(let i=0;i<text.length;i++){let ch=text[i];if(ch==='"'){if(quote&&text[i+1]==='"'){field+='"';i++}else quote=!quote;continue;}if(ch===sep&&!quote){row.push(field);field='';continue;}if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';continue;}field+=ch;}
 row.push(field);if(row.some(x=>x.trim()))rows.push(row);if(quote)throw Error('CSV com aspas não fechadas.');return rows;
}
function unzip(buffer){
 const result=new Map();let pos=0,total=0;
 while(pos+46<=buffer.length){if(buffer.readUInt32LE(pos)!==0x02014b50){pos++;continue;}
 const method=buffer.readUInt16LE(pos+10),size=buffer.readUInt32LE(pos+20),usize=buffer.readUInt32LE(pos+24),nl=buffer.readUInt16LE(pos+28),xl=buffer.readUInt16LE(pos+30),cl=buffer.readUInt16LE(pos+32),start=buffer.readUInt32LE(pos+42),name=buffer.subarray(pos+46,pos+46+nl).toString('utf8');pos+=46+nl+xl+cl;
 if(!['xl/sharedStrings.xml','xl/worksheets/sheet1.xml'].includes(name))continue;
 if(usize>16*1024*1024||size>8*1024*1024)throw Error('XLSX excede os limites de tamanho.');
 if(buffer.readUInt32LE(start)!==0x04034b50)throw Error('XLSX corrompido.');
 const offset=start+30+buffer.readUInt16LE(start+26)+buffer.readUInt16LE(start+28);
 const comp=buffer.subarray(offset,offset+size);let out;
 if(method===0)out=comp;else if(method===8)out=inflateRawSync(comp);else throw Error('Compactação XLSX incompatível.');
 total+=out.length;if(total>20*1024*1024)throw Error('XLSX muito grande.');result.set(name,out.toString('utf8'));
 }
 return result;
}
function unxml(s){return String(s||'').replace(/&#(x[0-9A-F]+|\d+);/gi,(_m,n)=>String.fromCodePoint(n[0]==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}
function columnIndex(s){let n=0;for(const c of s.toUpperCase().match(/[A-Z]+/)?.[0]||'')n=n*26+c.charCodeAt(0)-64;return n-1;}
function parseXLSX(buffer){
 const files=unzip(buffer);const sheet=files.get('xl/worksheets/sheet1.xml');if(!sheet)throw Error('Arquivo sem a primeira aba do Excel.');
 let shared=[];let xml=files.get('xl/sharedStrings.xml')||'';
 for(const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g))shared.push(unxml([...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join('')));
 const rows=[];
 for(const mr of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
 const row=[];for(const mc of mr[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
  const attrs=mc[1],inner=mc[2]||'',ref=/\br="([A-Z]+)\d+"/i.exec(attrs)?.[1],kind=/\bt="([^"]+)"/.exec(attrs)?.[1];
  const idx=ref?columnIndex(ref):row.length;if(idx>1000)continue;
  const v=/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1]||'';
  const inline=[...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join('');
  row[idx]=kind==='s'?(shared[Number(v)]||''):(kind==='inlineStr'?unxml(inline):unxml(v||inline));
 }if(row.some(x=>String(x||'').trim()))rows.push(row.map(x=>x||''));if(rows.length>limitRows+100)throw Error('Planilha excede o limite de 2.000 candidatos.');
 }return rows;
}
function normalizeDate(s){let a=String(s||'').trim();if(!a)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(a))return a;
 if(/^\d{2}\/\d{2}\/\d{4}$/.test(a)){let [d,m,y]=a.split('/');return `${y}-${m}-${d}`;}
 const n=Number(a);if(Number.isFinite(n)&&n>30000&&n<80000){const dt=new Date(Date.UTC(1899,11,30)+n*86400000);return dt.toISOString().slice(0,10)}return a;
}
function makeRows(table){
 if(!table?.length)throw Error('A planilha está vazia.');const headers=table[0].map(x=>mapHeaders[plain(x)]||'');if(!headers.includes('nome'))throw Error('A planilha deve possuir a coluna Nome.');
 const rows=[],issues=[];
 for(let i=1;i<table.length;i++){
  const values=table[i];if(!values.some(x=>String(x||'').trim()))continue;
  const r={linha:i+1,nome:'',email:'',telefone:'',fonte:'',data:'',observacoes:''};headers.forEach((h,j)=>{if(h)r[h]=String(values[j]??'').trim().slice(0,1000)});
  r.data=normalizeDate(r.data);
  const problem=validateRow(r);if(problem)issues.push({linha:r.linha,nome:r.nome,motivo:problem});else rows.push(r);
 }if(rows.length+issues.length>limitRows)throw Error('O limite é de 2.000 candidatos por arquivo.');return {rows,issues};
}
export function validateRow(r){if(!r.nome||r.nome.length<2)return 'nome ausente ou incompleto';if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))return 'e-mail inválido';if(r.data&&!/^\d{4}-\d{2}-\d{2}$/.test(r.data))return 'data inválida';return '';}
function keys(r){const k=[];if(r.email)k.push('e:'+plain(r.email));if(r.telefone)k.push('t:'+String(r.telefone).replace(/\D/g,''));if(!k.length)k.push('n:'+plain(r.nome));return k;}
function duplicates(db,vaga){const seen=new Set();for(const c of db.candidatos)if(c.vaga_id===vaga&&isCurrent(db,c))for(const k of keys(c))seen.add(k);return seen;}
export function checkLinks(db,vaga,process){const v=find(db.vagas,vaga);if(!v||!isCurrent(db,v))throw Error('Selecione uma vaga cadastrada.');if(process){const p=find(db.processos,process);if(!p||!isCurrent(db,p)||p.vaga_id!==vaga)throw Error('O processo não pertence à vaga selecionada.');}return v;}
export function previewBulk(db,buffer,fileName,vaga,process){
 checkLinks(db,vaga,process);if(buffer.length>6*1024*1024)throw Error('Arquivo acima de 6 MB.');
 const ext=String(fileName||'').split('.').pop().toLowerCase();let table;if(['csv','txt'].includes(ext))table=parseCSV(buffer);else if(ext==='xlsx')table=parseXLSX(buffer);else throw Error('Use um arquivo .csv ou .xlsx.');
 const {rows,issues}=makeRows(table),seen=duplicates(db,vaga),good=[];let dup=0;
 for(const row of rows){const ks=keys(row);if(ks.some(k=>seen.has(k))){dup++;issues.push({linha:row.linha,nome:row.nome,motivo:'duplicado nesta vaga'});}else{good.push(row);for(const k of ks)seen.add(k)}}
 return {ok:true,registros:good,validos:good.length,duplicados:dup,problemas:issues.length,erros:issues,exemplos:good.slice(0,12),total:rows.length+issues.length-dup,vaga_id:vaga,processo_id:process};
}
export function commitBulk(db,input){
 const list=input.registros||[],v=input.vaga_id,p=input.processo_id||'';const vacancy=checkLinks(db,v,p);
 if(!Array.isArray(list)||list.length<1||list.length>limitRows)throw Error('Informe até 2000 registros válidos.');
 const seen=duplicates(db,v);let proc=p;
 const records=[];let dup=0,invalid=0;
 for(const raw of list){const row={...raw};const bad=validateRow(row);if(bad){invalid++;continue}const ks=keys(row);if(ks.some(k=>seen.has(k))){dup++;continue}ks.forEach(k=>seen.add(k));records.push(row);}
 if(!records.length)throw Error('Nenhum candidato novo para importar.');
 if(!proc){proc=guid('p');db.processos.push({empresa_id:active(db),id:proc,titulo:`Seleção - ${vacancy.cargo} - ${new Date().toLocaleDateString('pt-BR')}`,departamento:vacancy.departamento,funcao:vacancy.cargo,vaga_id:v,data:new Date().toISOString().slice(0,10),observacoes:'Criado durante importação em lote',origem:'Importação em lote'});audit(db,'criado automaticamente','processos',proc);}
 for(const r of records)db.candidatos.push({empresa_id:active(db),id:guid('c'),nome:r.nome,telefone:r.telefone||'',email:r.email||'',fonte:r.fonte||'Importação em lote',data:r.data||new Date().toISOString().slice(0,10),observacoes:r.observacoes||'',vaga_id:v,processo_id:proc,origem:'Importação em lote',etapas:{}});
 audit(db,`importação em lote: ${records.length} candidatos`,'candidatos',v);
 return {ok:true,importados:records.length,duplicados:dup,invalidos:invalid,vaga_id:v,processo_id:proc};
}
