# Migrar dados do Conexão Talentos 1.5 (Windows) para Web 2.0 (beta)

## Preservar os registros

1. Abra a versão **1.5** com seu usuário atual.
2. Faça **Dados & Segurança → Backup**, baixe o JSON e guarde uma cópia fora do computador.
3. Caso existam vários usuários antigos, entre em **cada usuário** e exporte um backup próprio, pois cada um tem ambiente independente.
4. Não inclua os arquivos JSON no GitHub. Eles podem conter informações pessoais de candidatos.

## Importar na versão web

1. Configure a conexão com o Google Drive e teste o site publicado **com dados fictícios**.
2. Crie o primeiro administrador no novo sistema e guarde a chave de recuperação; **senhas antigas não são migradas** automaticamente por segurança.
3. Para cada usuário, crie sua conta e seu espaço de trabalho vazio.
4. Faça login no espaço de destino, abra **Dados & Segurança → Restaurar backup** e selecione o JSON exportado do Windows.
5. Confira a quantidade de empresas, vagas, processos, candidatos, convites e relatórios DISC.
6. Ajuste o endereço público dos testes para o **novo domínio HTTPS**, quando estiver homologado.

**Atenção:** restaurar um backup **substitui integralmente** os dados do espaço de trabalho atual. Não restaure em um espaço que já possua dados importantes, sem outro backup.

Os links antigos do DISC hospedados pelo Cloudflare podem permanecer dependentes do aplicativo Windows antigo; **não assuma que migrar o banco preserva convites em andamento**. Gere e teste novos links na aplicação web após a migração.

## Aceite final

- [ ] Existe backup externo íntegro da versão 1.5.
- [ ] A quantidade de registros confere em cada empresa.
- [ ] Usuários novos podem fazer login e recuperar acesso com chave própria.
- [ ] O isolamento entre contas e empresas foi testado.
- [ ] O envio e o recebimento de DISC foram testados com participantes fictícios.
- [ ] PDFs e CSV foram conferidos.
- [ ] A persistência real no Google Drive foi validada.
- [ ] A concorrência de respostas simultâneas foi resolvida e testada.
- [ ] As medidas de proteção de dados foram revisadas antes de usar informações reais.
