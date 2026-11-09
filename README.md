# Conexão Talentos — versão Web 2.0 (beta)

Migração do sistema Conexão Talentos 1.5 para **HTML, CSS e JavaScript**, com interface visual preservada, API em **Node.js (JavaScript)**, arquivos prontos para GitHub e estrutura compatível com **Vercel Functions**. O armazenamento em produção foi desenvolvido para **Google Drive**. **Esta é uma versão beta para homologação, não uma publicação em produção.**

## O que está incluído

| Área | Recursos |
|---|---|
| Visão geral | Indicadores por empresa, prazo médio de fechamento sem vagas canceladas, movimentações e DISC |
| Vagas | Cadastro, edição, prazos, cancelamentos, expectativas DISC, filtros e CSV |
| Processos | Agrupamento visual por setor, edição, vínculo com vaga, filtros por período e função |
| Candidatos | Banco, etapas e status, edição, importação CSV e XLSX em lote com prévia e duplicidades |
| Funil | Etapas, aprovados e reprovados com listagens acessíveis |
| DISC | Convites com tokens individuais, formulário online para celular, importação JSON offline, revogação/exclusão, filtro por vaga/setor/função/período |
| Relatórios | Relatório DISC PDF com gráfico D/I/S/C, quatro descrições comportamentais e leitura exploratória das prioridades definidas para a vaga; comparação entre candidatos; exportação CSV |
| Contas | Administrador, múltiplos usuários com espaços independentes, criação de novas empresas e filtragem por empresa |
| Recuperação de senha | Botão **Esqueci minha senha**, chave de recuperação individual de uso único e rotação da chave após redefinir a senha |
| Backup | Exportar e restaurar JSON de um espaço de trabalho; importação do backup da versão Windows 1.5 |

**Nota sobre o DISC:** o questionário tem caráter exploratório. Não é um teste psicológico validado para diagnóstico, classificação de aptidão ou previsão individual de desempenho; decisões de contratação precisam de outras evidências.

## Iniciar no computador para testar (sem Google Drive)

1. Instale o **Node.js 20 ou superior** no computador.
2. Extraia todos os arquivos deste projeto numa pasta.
3. No terminal, entre na pasta e execute `npm start`, **ou** clique duas vezes em `INICIAR_TESTE_WINDOWS.bat` no Windows.
4. Acesse **http://127.0.0.1:3000**.
5. No primeiro acesso, cadastre a senha do administrador (mínimo de 10 caracteres) e **guarde a chave de recuperação gerada**.
6. Cadastre uma empresa, uma vaga e um candidato fictício para testar o convite DISC e os relatórios.

Neste modo, o sistema usa `./data/` **apenas para desenvolvimento local**. Essa pasta é ignorada pelo Git. Não é apropriado iniciar pela Vercel com dados locais, porque o filesystem de funções não é persistente.

Para conferir os testes: `npm test`. Para verificar a sintaxe: `npm run check`.

## Estrutura do projeto

```text
Conexao_Talentos_Web_v2/
├── public/
│   ├── index.html             Painel web (visual herdado da v1.5)
│   ├── favicon.ico
│   └── static/
│       ├── app.js             Interface, filtros, modais, ações e relatórios
│       ├── style.css          Identidade visual
│       └── survey.html        Questionário DISC responsivo
├── api/index.js              Entrada serverless Vercel
├── lib/
│   ├── handler.js             Endpoints e integrações de domínio
│   ├── auth.js                Login, sessões e recuperação
│   ├── storage.js             Google Drive REST e local para testes
│   ├── logic.js               Vagas, empresas, filtros e escore DISC
│   ├── bulk.js                Importação CSV/XLSX
│   └── report.js              Relatório DISC em PDF via JavaScript
├── scripts/
│   └── obter-token-google.mjs Auxiliar para OAuth Google (local)
├── tests/                    Testes automáticos com dados fictícios
├── .env.example              Lista de variáveis (NÃO contém segredos)
├── .gitignore                Proteção contra upload de segredos e dados
├── vercel.json               Rotas para Vercel
├── GUIA_PUBLICACAO.md        Configuração Google Drive, GitHub, Vercel
└── CHECKLIST_MIGRACAO.md     Migração segura dos dados antigos
```

## Segurança e estado do projeto

- A pasta **`data/`**, backups reais, senhas e credenciais **nunca** devem ser enviados ao GitHub.
- Na Vercel, configure `DATA_BACKEND=google-drive`, `GOOGLE_DRIVE_FOLDER_ID`, credenciais OAuth e segredos de sessão/instalação **somente nas Environment Variables**.
- O Drive atua como repositório de arquivos JSON, não como banco transacional. **Atualizações simultâneas entre funções paralelas podem causar perda de alterações.** Portanto, não libere para candidatos e empresas reais sem revisar concorrência, escalabilidade e as medidas de proteção de dados aplicáveis.
- Os testes presentes verificam a API local e a geração do PDF; **não comprovam implantação na Vercel, conexão com uma conta real do Google ou auditoria independente de segurança**.
- A recuperação exige a chave de segurança previamente salva. Se a chave se perder e não houver outra sessão administrativa autorizada, não há recuperação automática por e-mail neste pacote.

Veja o [guia de publicação](GUIA_PUBLICACAO.md) e o [checklist de migração](CHECKLIST_MIGRACAO.md).
