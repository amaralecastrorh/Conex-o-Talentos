import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {previewBulk,commitBulk} from '../lib/bulk.js';
import {emptyData} from '../lib/logic.js';

const fixture=fileURLToPath(new URL('./fixtures/candidatos_ficticios.xlsx',import.meta.url));

test('Importacao XLSX: duas linhas ficticias, vinculo com vaga, duplicidade',async()=>{
 const d=emptyData();d.empresas.push({id:'em1',nome:'Empresa Demonstracao'});d.config.empresa_ativa='em1';d.vagas.push({id:'v1',empresa_id:'em1',cargo:'Estagio em Acordos',departamento:'Juridico'});
 const file=await readFile(fixture);
 const preview=previewBulk(d,file,'candidatos_ficticios.xlsx','v1','');
 assert.equal(preview.validos,2);assert.equal(preview.duplicados,0);assert.equal(preview.problemas,0);
 const committed=commitBulk(d,{vaga_id:'v1',registros:preview.registros});
 assert.equal(committed.importados,2);assert.equal(d.candidatos.length,2);assert.equal(d.processos.length,1);
 const second=previewBulk(d,file,'candidatos_ficticios.xlsx','v1','');
 assert.equal(second.validos,0);assert.equal(second.duplicados,2);
});
