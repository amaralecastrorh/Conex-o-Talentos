# Publicação do Conexão Talentos — Google Drive → GitHub → Vercel

> **Estado atual:** arquivos preparados, mas **nenhuma conta foi conectada e nenhum site foi publicado**. Antes de usar dados pessoais de candidatos, faça a homologação de segurança e concorrência.

## 1. Salve a versão 1.5 e teste a versão web

Na versão Windows, acesse **Dados & Segurança → Backup**. Guarde o arquivo JSON em local privado. Veja o passo a passo em `CHECKLIST_MIGRACAO.md`. **Não coloque esse backup no GitHub.**

Instale Node.js >=20 e rode `npm start` na pasta do projeto. Teste no endereço `http://127.0.0.1:3000`, com dados fictícios. Para executar os testes automatizados, rode `npm test`.

## 2. Configure o Google Drive (dados separados do código)

A aplicação grava `users.json` e um arquivo `workspace_*.json` para cada usuário, dentro de uma pasta exclusiva no Google Drive. Crie, em sua conta do Google, uma pasta como **Conexao Talentos - Dados PRIVADOS** e copie o **ID da pasta** da URL. O conteúdo da pasta fica privado: não compartilhe publicamente.

**Opção A (mais prática para Meu Drive): OAuth2 com a conta Google proprietária.**

1. Abra o **Google Cloud Console** e crie/selecione um projeto privado.
2. Ative **Google Drive API**.
3. Em **Google Auth Platform/OAuth consent**, configure a aplicação para uso interno, quando aplicável, ou uma conta autorizada de teste. Restrinja os usuários autorizados conforme o domínio e a política da organização.
4. Crie **OAuth Client ID / Web application** e adicione a URL de redirecionamento: `http://127.0.0.1:5178/callback`.
5. No seu computador, em um terminal privado, configure `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` com os valores retornados pelo Google. Não salve essas credenciais em arquivos versionados.
6. Execute `node scripts/obter-token-google.mjs`. O script mostra um link de autorização; entre com a conta proprietária da pasta. O Google solicitará acesso amplo ao Drive — leia as permissões com atenção, pois essa versão utiliza o escopo `https://www.googleapis.com/auth/drive`.
7. Após autorizar, copie **`GOOGLE_OAUTH_REFRESH_TOKEN`** mostrado no seu terminal. Guarde em gerenciador de segredos. Não cole em chats, prints ou repositórios.
8. Defina `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` e `GOOGLE_OAUTH_REFRESH_TOKEN` nas variáveis de ambiente da Vercel.

**Opção B (organizações com Shared Drive): conta de serviço** com permissão de gravação na pasta de um *Shared Drive*, usando `GOOGLE_SERVICE_ACCOUNT_JSON` como segredo da Vercel. Contas de serviço comuns não são proprietárias de arquivos em Meu Drive. Evite misturar as duas opções.

**Observação:** políticas de Google Workspace, verificação do OAuth e escopos restritos podem exigir trabalho adicional do administrador. O ambiente de produção não foi conectado à conta Google do usuário nesta entrega.

## 3. Crie um repositório **privado** no GitHub

1. Entre no GitHub e crie um repositório como `conexao-talentos-web` (preferencialmente **Private**).
2. Envie a pasta do projeto **sem** `data/`, `.env`, credenciais, backups ou currículos reais.
3. A partir do terminal, dentro do projeto, você pode usar:

```bash
git init
git add .
git status
git commit -m "Refatoracao web beta do Conexao Talentos"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

Substitua o endereço de exemplo pela URL **real** do repositório criado. Confira `git status` antes do commit; `.gitignore` protege os principais segredos, mas cabe verificar a lista.

## 4. Conecte o GitHub à Vercel (somente após validar os dados)

1. No painel da Vercel, crie novo projeto e importe o repositório do GitHub.
2. Selecione **Other/Node.js** como configuração de projeto. A pasta `public/` já contém os arquivos estáticos; `api/index.js` atende as rotas do servidor.
3. Configure as **Environment Variables** em Production e Preview, conforme o caso:

| Nome | Conteúdo |
|---|---|
| `DATA_BACKEND` | `google-drive` |
| `GOOGLE_DRIVE_FOLDER_ID` | ID da pasta privada no Drive |
| `GOOGLE_OAUTH_CLIENT_ID` | Cliente OAuth criado no Google |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Segredo OAuth (nunca no GitHub) |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Token de atualização privado |
| `SESSION_SECRET` | Segredo aleatório de pelo menos 32 caracteres |
| `ADMIN_SETUP_TOKEN` | Código aleatório secreto exigido para criar o primeiro admin |
| `PUBLIC_BASE_URL` | URL HTTPS final da aplicação, quando definida |

Crie os dois segredos com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` em seu computador. Não use o mesmo valor para os dois.

4. Publicada a versão de teste, confirme `https://SEU-SITE.vercel.app/api/health` e a tela inicial no site. **Não preencha com dados reais** antes de verificar que `storage` é `google-drive` e de concluir os testes.
5. No primeiro acesso, informe o `ADMIN_SETUP_TOKEN`, cadastre a senha e guarde sua **chave de recuperação**. O token de instalação não é a senha do usuário e não deve aparecer em código público.
6. Faça testes fictícios de criação de empresa/vaga/candidato, envio de DISC, recebimento simultâneo em duas sessões, exclusão, importação e PDF, verificando que os arquivos aparecem apenas na pasta privada do Drive.

A Vercel hospeda o site/API; o Google Drive guarda os dados. O GitHub guarda **apenas o código-fonte**.

## 5. Recuperação de senha

Na página inicial, clique em **Esqueci minha senha**. Informe o login, a chave de recuperação gerada no primeiro acesso e a senha nova (mínimo 10 caracteres). Uma chave **nova** será emitida e a anterior ficará inválida. A recuperação invalida as sessões antigas desse usuário.

O administrador também pode redefinir a senha de um usuário secundário na aba de segurança. Nunca divulgue a chave de recuperação em WhatsApp, e-mail aberto ou GitHub.

## 6. Homologação obrigatória antes de usar com candidatos

- Confirmar permissões da pasta privada no Drive (somente administradores autorizados).
- Corrigir o risco de gravações simultâneas: a implementação atual guarda **cada espaço num arquivo JSON**, e requisições em diferentes instâncias da Vercel podem sobrescrever alterações feitas em paralelo. Para produção, adotar mecanismo de escrita coordenada, fila ou banco transacional sem abandonar o backup no Google Drive.
- Avaliar proteção LGPD (base legal, aviso de privacidade, retenção, exclusão, logs, trilha de auditoria, mínimo acesso, segurança de tokens, cópias de backup).
- Testar limites/cota do Drive e da Vercel, quedas de rede, upload de arquivos e alta concorrência.
- Testar login, recuperação, isolamento entre usuários/empresas e impossibilidade de acesso não autorizado a relatórios e cadastros.
- Testar envio de DISC com vários participantes e confirmar a gravação de **todas** as respostas sem sobrescrita.

**Não desligue a versão Windows 1.5 nem substitua seu banco principal até concluir a migração e a homologação.**
