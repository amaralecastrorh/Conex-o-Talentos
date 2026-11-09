/** PDF em JavaScript puro. Mantém as 4 páginas e visual institucional da versão 1.5. */
import {discAlignment, factors} from './logic.js';
const W=595.28,H=841.89;
const COLORS={D:'#bd7062',I:'#c9a057',S:'#4c9983',C:'#6b8eb4'};
const DESCS={
 D:{title:'Dominância',summary:'Iniciativa, assertividade e foco em resultados. Pode contribuir com decisões e respostas a desafios.',strength:'Tomada de decisão, objetividade e enfrentamento de desafios.',attention:'Investigue escuta, negociação, respeito às divergências e avaliação dos impactos das decisões.',questions:['Conte uma situação em que precisou decidir com informações incompletas.','Como reage quando suas ideias são questionadas?','Como equilibra rapidez na entrega e colaboração?']},
 I:{title:'Influência',summary:'Comunicação, sociabilidade e articulação interpessoal. Pode contribuir com relações e apresentação de ideias.',strength:'Comunicação, construção de relacionamentos e mobilização de interlocutores.',attention:'Investigue escuta ativa, organização dos compromissos e registro de informações.',questions:['Conte uma situação em que precisou negociar sem autoridade formal.','Como confirma que suas orientações foram compreendidas?','Como controla tarefas e prazos após reuniões?']},
 S:{title:'Estabilidade',summary:'Constância, paciência e cooperação. Pode contribuir com rotinas consistentes e apoio às equipes.',strength:'Persistência, cooperação, apoio aos colegas e confiabilidade.',attention:'Investigue adaptação a mudanças e capacidade de discordar e lidar com prioridades simultâneas.',questions:['Descreva como reagiu a uma mudança urgente.','Como se posiciona quando discorda de um procedimento?','Como administra muitas demandas simultâneas?']},
 C:{title:'Conformidade',summary:'Método, organização e atenção aos detalhes. Pode contribuir com revisão e controle de qualidade.',strength:'Análise cuidadosa, cumprimento de procedimentos, precisão e organização.',attention:'Investigue flexibilidade diante de incerteza e priorização quando o prazo é curto.',questions:['Conte uma ocasião em que entregou algo com prazo curto.','Como decide quando uma revisão já é suficiente?','Como reage a uma mudança de regras durante a tarefa?']}
};
function latin1(s){return Buffer.from(Array.from(String(s)).map(ch=>{const cp=ch.charCodeAt(0);const specials={'–':150,'—':151,'‘':145,'’':146,'“':147,'”':148,'•':149,'…':133};return cp<256?cp:(specials[ch]||63)}));}
function escapePDF(s){return latin1(s).toString('latin1').replace(/[\\()]/g,m=>'\\'+m);}
function bytes(s){return Buffer.from(s,'latin1')}
function rgb(s){return [1,3,5].map(i=>(parseInt(s.slice(i,i+2),16)/255).toFixed(3)).join(' ')}
class Page{
 constructor(){this.ops=[]}
 color(c){this.ops.push(`${rgb(c)} rg`)}
 rect(x,y,w,h,c){this.color(c);this.ops.push(`${x} ${(H-y-h).toFixed(2)} ${w} ${h} re f`)}
 line(x1,y1,x2,y2,c){this.ops.push(`${rgb(c)} RG 0.75 w ${x1} ${(H-y1).toFixed(2)} m ${x2} ${(H-y2).toFixed(2)} l S`)}
 text(x,y,size,s,bold=false,color='#213b4e'){this.color(color);this.ops.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${(H-y).toFixed(2)} Tm (${escapePDF(s)}) Tj ET`)}
 paragraph(x,y,s,max=96,sz=9.4,line=15,color='#344a5b'){
  let words=String(s).split(/\s+/), current='';const lines=[];
  for(const w of words){if(!w)continue;if((current+' '+w).trim().length>max&&current){lines.push(current);current=w}else{current=(current+' '+w).trim()}}if(current)lines.push(current);
  for(const l of lines){this.text(x,y,sz,l,false,color);y+=line;}return y;
 }
}
function doc(p,n,title,company){
 p.rect(0,0,W,99,'#162840');p.rect(46,30,34,34,'#cda278');p.text(53,52,13,'CT',true,'#162840');p.text(94,41,10.3,(company||'CONEXÃO TALENTOS').slice(0,55).toUpperCase(),true,'#ffffff');p.text(94,57,8,'CONEXÃO TALENTOS / RECRUTAMENTO E SELEÇÃO',false,'#cbd9e0');
 p.text(47,128,16.5,title,true,'#162840');p.line(47,765,548,765,'#e3e9ed');p.text(47,788,8.2,'Documento confidencial - acesso restrito ao RH',false,'#6d8190');p.text(500,788,8.2,`${n} / 4`,true,'#6d8190');
}
function date(s){const a=String(s||'').slice(0,10).split('-');return a.length===3?`${a[2]}/${a[1]}/${a[0]}`:'—'}
function createPDF(pages){
 const objects=[];const kids=[];
 objects.push('<< /Type /Catalog /Pages 2 0 R >>');
 pages.forEach((_,i)=>kids.push(`${5+i*2} 0 R`));
 objects.push(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`);
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 pages.forEach((p,i)=>{let stream=p.ops.join('\n')+'\n',content=bytes(stream);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6+i*2} 0 R >>`);objects.push(`<< /Length ${content.length} >>\nstream\n${stream}endstream`)});
 let output='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n',offs=[0];
 for(let i=0;i<objects.length;i++){offs.push(bytes(output).length);output+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`}
 let xref=bytes(output).length;output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(const off of offs.slice(1))output+=`${String(off).padStart(10,'0')} 00000 n \n`;
 output+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return bytes(output);
}
export function renderDiscPDF(inv,c,process,vaga,company){
 const scores=inv.scores||{},most=inv.mais_contagem||{},least=inv.menos_contagem||{};
 const max=Math.max(...factors.map(f=>Number(scores[f]||0)));
 const tops=factors.filter(f=>Number(scores[f]||0)===max);
 const selected=tops.length===1?DESCS[tops[0]]:{title:'Distribuição combinada',summary:'Duas ou mais dimensões apresentam o mesmo saldo. Não há predominância única neste conjunto de escolhas.',strength:'Características variadas podem ser úteis em diferentes contextos profissionais.',attention:'Investigue a conduta em situações reais da função, evitando classificações rígidas.',questions:['Como adapta seu estilo a situações diferentes?','Quais atividades exigem de você maior esforço?','Como combina organização, comunicação e decisão?']};
 const name=c?.nome||inv.participante||'Não informado',role=process?.funcao||vaga?.cargo||'Não informado',label=tops.join(' / ');
 const p1=new Page();doc(p1,1,'RELATÓRIO INDIVIDUAL - PERFIL DISC',company);
 p1.text(48,157,8,'PARTICIPANTE',true,'#7e91a0');p1.text(48,176,14,name.slice(0,50),true);
 p1.text(48,198,8,'VAGA / FUNÇÃO',true,'#7e91a0');p1.text(48,214,10,role.slice(0,74));
 p1.text(48,232,8,'PROCESSO',true,'#7e91a0');p1.text(48,246,10,(process?.titulo||'Não informado').slice(0,80));
 p1.text(48,265,8,'RESPONDIDO EM',true,'#7e91a0');p1.text(136,265,9,date(inv.respondido_em));p1.text(335,265,8,'QUESTIONÁRIO',true,'#7e91a0');p1.text(425,265,9,`${inv.respostas?.length||0} grupos`);
 p1.rect(47,282,501,42,'#edf5f9');p1.text(60,300,9.2,'DIMENSÃO DE MAIOR SALDO',true,'#506a7e');p1.text(60,316,12,`Perfil: ${label} | ${selected.title}`,true,'#1d4054');
 p1.text(48,349,12,'RESULTADOS POR DIMENSÃO',true);p1.text(48,367,8,"Saldo: escolhas 'mais' menos escolhas 'menos' (intervalo -20 a +20)",false,'#758797');
 factors.forEach((f,i)=>{let y=403+i*48;let n=Number(scores[f]||0);p1.rect(48,y-18,31,29,COLORS[f]);p1.text(57,y+2,14,f,true,'#ffffff');p1.text(89,y,10,DESCS[f].title,true);p1.rect(226,y-10,260,17,'#edf1f3');p1.rect(355,y-10,1.5,17,'#6e8190');let width=Math.min(129,Math.abs(n)/20*129);p1.rect(n>=0?356:355-width,y-8,width,13,COLORS[f]);p1.text(496,y+2,10,`${n>=0?'+':''}${n}`,true);p1.text(227,y+19,8,`${most[f]||0} mais / ${least[f]||0} menos`,false,'#8293a0');});
 p1.rect(47,597,501,105,'#faf8f4');p1.text(59,618,10.5,'LEITURA DESCRITIVA',true,'#685b47');let y=p1.paragraph(59,638,selected.summary,96,9.4,14);p1.text(59,y+6,8.5,'As pontuações são escolhas relativas, não níveis absolutos de competência.',false,'#746c62');p1.text(47,729,8.4,'Instrumento exploratório sem validação psicométrica demonstrada.',false,'#8a725e');
 const p2=new Page();doc(p2,2,'INTERPRETAÇÃO E ENTREVISTA',company);p2.text(48,166,9,'DIMENSÃO EM DESTAQUE',true,'#7e91a0');p2.text(48,186,16,`${selected.title} (${label})`,true);
 p2.rect(47,207,501,82,'#eaf4f0');p2.text(60,228,10,'POSSÍVEIS CONTRIBUIÇÕES',true,'#327963');p2.paragraph(60,249,selected.strength,90,10,15,'#365a4d');
 p2.rect(47,305,501,96,'#fdf5eb');p2.text(60,327,10,'PONTOS PARA INVESTIGAR',true,'#906d43');p2.paragraph(60,349,selected.attention,91,10,15,'#69563f');p2.text(48,428,12,'PERGUNTAS SUGERIDAS PARA ENTREVISTA',true);
 selected.questions.forEach((q,i)=>{let y=462+i*63;p2.rect(49,y-15,25,25,'#ebeff3');p2.text(58,y+2,10,String(i+1),true);p2.paragraph(86,y,q,84,9.8,14)});
 p2.line(48,666,548,666,'#e0e7ec');p2.text(48,686,10,'LIMITES DE INTERPRETAÇÃO',true);p2.paragraph(48,706,'O resultado é baseado em autorrelato e não diagnostica personalidade, competência, saúde mental ou aptidão para a vaga. Utilize apenas como apoio complementar, com entrevistas e critérios objetivos.',99,8.9,12.5,'#657987');
 const p3=new Page();doc(p3,3,'ALINHAMENTO EXPLORATÓRIO À VAGA',company);p3.text(48,159,9,'VAGA ANALISADA',true,'#7e91a0');p3.text(48,178,14,role.slice(0,55),true);p3.text(48,200,9,'Processo: '+(process?.titulo||'Não informado').slice(0,73));
 const alignment=discAlignment(inv,process,vaga);
 p3.rect(47,219,501,58,'#edf5f9');p3.text(59,240,10,'ANÁLISE DESCRITIVA',true,'#1d4054');p3.paragraph(59,260,alignment.configured?'Convergências entre dimensões priorizadas para a vaga e saldos do formulário. Não é uma nota de compatibilidade.':'Defina prioridades DISC no cadastro da vaga ou processo para visualizar a comparação.',95,8.7,12.5);
 p3.text(48,306,11.5,'PRIORIDADES CADASTRADAS E SALDOS',true);
 factors.forEach((f,i)=>{const y=352+i*68;const pr=Number(alignment.priorities?.[f]||0);const label=pr===2?'Prioritário':pr===1?'Relevante':'Não priorizado';const score=Number(scores[f]||0);p3.rect(48,y-18,35,31,COLORS[f]);p3.text(59,y+3,14,f,true,'#ffffff');p3.text(94,y-4,10.5,`${DESCS[f].title} — ${label}`,true);p3.text(94,y+14,9.5,`Saldo do candidato: ${score>=0?'+':''}${score}`,false,'#557082');p3.line(48,y+27,548,y+27,'#e3e9ed');});
 p3.rect(47,618,501,108,'#faf8f4');p3.text(59,640,10.5,'PONTOS PARA ENTREVISTA',true,'#685b47');let y3=660;for(const n of alignment.notes.slice(0,3)){y3=p3.paragraph(59,y3,'• '+n,91,8.8,12.3,'#475869')+4;}
 const p4=new Page();doc(p4,4,'GUIA DAS QUATRO DIMENSÕES DISC',company);p4.text(48,162,10,'CARACTERÍSTICAS GERAIS',true,'#7e91a0');p4.paragraph(48,185,'As dimensões descrevem tendências associadas a escolhas relativas deste questionário. Todas as pessoas podem expressar comportamentos dos quatro grupos conforme a situação.',99,9.6,14);
 factors.forEach((f,i)=>{const y=241+i*119;p4.rect(47,y,501,105,i%2?'#f6f9fb':'#f9f6f1');p4.rect(60,y+15,32,30,COLORS[f]);p4.text(70,y+36,14,f,true,'#ffffff');p4.text(104,y+32,12,`${f} - ${DESCS[f].title}`,true);p4.paragraph(104,y+52,DESCS[f].summary,78,9.2,14,'#3c5264');});
 p4.line(48,734,548,734,'#e0e7ec');p4.text(48,752,8.2,'Não substitui avaliação profissional, experiência comprovada ou entrevista estruturada.',false,'#6d8190');
 return createPDF([p1,p2,p3,p4]);
}
