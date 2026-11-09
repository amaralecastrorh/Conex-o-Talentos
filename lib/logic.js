/** Modelo de domínio independente do ambiente e reutilizável em testes. */
import { randomBytes } from 'node:crypto';
export const factors=['D','I','S','C'];
export const stages=['Triagem de Currículo','Entrevista Inicial','DISC','Entrevista com Gestor','Prova Prática','Resultado','Efetivação'];
export const kinds={vagas:'v',processos:'p',candidatos:'c'};
export const guid=(prefix='id')=>prefix+'_'+randomBytes(12).toString('base64url');
export const emptyData=()=>({version:2,empresas:[],vagas:[],processos:[],candidatos:[],convites:[],historico:[],config:{empresa_ativa:''}});
export const text=v=>String(v??'');
export const find=(rows,id)=>rows.find(x=>x.id===id);
export function normalize(data){
 const out={...emptyData(),...data};for(const k of ['empresas','vagas','processos','candidatos','convites','historico'])if(!Array.isArray(out[k]))out[k]=[];
 if(!out.config||typeof out.config!=='object')out.config={};
 if(out.empresas.length===0&&['vagas','processos','candidatos','convites'].some(k=>out[k].length))out.empresas.push({id:'empresa_historica',nome:'Base histórica (renomeie para sua empresa)',criado_em:'migração para web'});
 if(!find(out.empresas,out.config.empresa_ativa))out.config.empresa_ativa=out.empresas[0]?.id||'';
 for(const k of ['vagas','processos','candidatos','convites','historico'])for(const row of out[k])if(!row.empresa_id&&out.config.empresa_ativa)row.empresa_id=out.config.empresa_ativa;
 return out;
}
export function active(db){return db.config?.empresa_ativa||''}
export function isCurrent(db,r){return !!active(db)&&r?.empresa_id===active(db)}
export function scoped(db){const d={...db,config:{...db.config},empresas:db.empresas};for(const k of ['vagas','processos','candidatos','convites','historico'])d[k]=db[k].filter(x=>isCurrent(db,x));return d;}
export function assertCompanyLink(db,kind,record){
 const check=(which,id)=>{if(id&&!db[which].some(row=>row.id===id&&isCurrent(db,row)))throw Error('Registro vinculado não pertence à empresa selecionada.');};
 if(kind==='processos')check('vagas',record.vaga_id);
 if(kind==='candidatos'){
   check('processos',record.processo_id);check('vagas',record.vaga_id);
   const p=find(db.processos,record.processo_id);
   if(p?.vaga_id&&record.vaga_id&&p.vaga_id!==record.vaga_id)throw Error('A vaga e o processo selecionados não correspondem.');
 }
}
export function cleanRecord(kind,raw){
 const fields={vagas:['cargo','departamento','solicitante','abertura','prazo','fechamento','responsavel','etapa','situacao','observacoes','origem'],processos:['titulo','departamento','funcao','vaga_id','data','observacoes','origem'],candidatos:['nome','telefone','email','fonte','processo_id','vaga_id','data','observacoes','origem']};
 if(!fields[kind])throw Error('Tipo inválido.');
 const row={};for(const f of fields[kind])row[f]=text(raw?.[f]).trim().slice(0,4000);
 if(kind!=='candidatos'){
   row.disc_expectativas={};for(const f of factors){const n=Number(raw?.disc_expectativas?.[f]||0);row.disc_expectativas[f]=[0,1,2].includes(n)?n:0;}
   row.disc_contexto=text(raw?.disc_contexto).trim().slice(0,600);
 }else{row.etapas={};for(const st of stages){const v=text(raw?.etapas?.[st]);row.etapas[st]=['Aprovado','Reprovado','Pendente'].includes(v)?v:'';}}
 return row;
}
export function audit(db,acao,tipo,id){db.historico.push({empresa_id:active(db),quando:new Date().toISOString(),acao,tipo,id});if(db.historico.length>3000)db.historico.splice(0,db.historico.length-3000);}
export function scoreAnswers(answers){
 if(!Array.isArray(answers)||answers.length!==20)throw Error('Responda aos 20 grupos para concluir o DISC.');
 const scores={D:0,I:0,S:0,C:0},mais_contagem={D:0,I:0,S:0,C:0},menos_contagem={D:0,I:0,S:0,C:0};
 for(const a of answers){const m=a?.mais,l=a?.menos;if(!factors.includes(m)||!factors.includes(l)||m===l)throw Error('Escolhas inválidas: marque opções diferentes em cada grupo.');scores[m]++;scores[l]--;mais_contagem[m]++;menos_contagem[l]++;}
 const max=Math.max(...factors.map(f=>scores[f]));const top=factors.filter(f=>scores[f]===max);
 return {scores,mais_contagem,menos_contagem,perfil:top[0],perfis_predominantes:top};
}
export function discAlignment(invite,process,vaga){
 const priorities={...vaga?.disc_expectativas,...process?.disc_expectativas};
 const hasProcess=process?.disc_expectativas&&factors.some(f=>Number(process.disc_expectativas[f])>0);
 const picks=hasProcess?process.disc_expectativas:(vaga?.disc_expectativas||{});
 const prioritiesSet=factors.filter(f=>Number(picks[f])>0);
 if(!prioritiesSet.length)return {configured:false,notes:['Nenhuma prioridade DISC foi configurada para esta vaga.']};
 const positive=prioritiesSet.filter(f=>Number(invite?.scores?.[f])>0);
 const other=prioritiesSet.filter(f=>Number(invite?.scores?.[f])<=0);
 return {configured:true,priorities:picks,positive,other,notes:[positive.length?'Características com saldo positivo nas dimensões priorizadas: '+positive.join(', ')+'.':'Nenhuma dimensão priorizada apresentou saldo positivo.',other.length?'Explorar em entrevista as dimensões: '+other.join(', ')+'.':'Todas as dimensões priorizadas apresentaram saldo positivo.','Não corresponde a uma medida validada de adequação, aptidão ou desempenho profissional.']};
}
