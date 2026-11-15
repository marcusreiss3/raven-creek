# Hospedagem (Square Cloud)

O repositório já vem pronto para a Square Cloud. O arquivo `squarecloud.app` aponta para
`iniciar-squarecloud.mjs`, que instala as dependências, compila o cliente e sobe o servidor.
O site, a API e o Socket.IO rodam juntos na porta 80.

Na primeira subida, ele demora alguns minutos (instalação e compilação). Nas reinicializações
seguintes, só refaz o que mudou.

## Banco de dados

O jogo precisa de um PostgreSQL. As opções são:

- **Supabase (grátis)**: crie um projeto e, em *Connect*, copie a URI do **Session pooler**
  (porta 5432). O SSL é ativado sozinho para endereços do Supabase.
- **Banco da Square Cloud** (planos Standard em diante): copie a URL de conexão para `DATABASE_URL`,
  baixe o `certificate.pem` e cole o conteúdo dele inteiro em `DATABASE_CERT`. O certificado
  nunca deve ir para o GitHub.
- Qualquer outro PostgreSQL. Se ele exigir SSL, defina `DATABASE_SSL=1`.

As tabelas e o mundo são criados sozinhos na primeira subida.

## Variáveis de ambiente (painel → Variáveis de ambiente)

| Variável | Obrigatória | O que é |
|---|---|---|
| `DATABASE_URL` | sim | URI do PostgreSQL |
| `JWT_SECRET` | não | segredo dos logins; sem ele, o servidor gera um e guarda no banco |
| `SEED_ADMIN_PASSWORD` | sim | senha da conta `admin` criada num banco novo |
| `SEED_DEMO` | recomendado `0` | `0` não cria as contas de demonstração |
| `CLIENT_ORIGIN` | opcional | endereço do site, ex. `https://ravencreek.squareweb.app` |
| `DATABASE_CERT` | só no banco da Square | conteúdo do `certificate.pem` |
| `DATABASE_PASSWORD` | opcional | senha do banco; substitui a da URL (útil com `<password>` ou caracteres especiais) |
| `DB_POOL_MAX` | opcional | conexões simultâneas com o banco (padrão 15) |

## Avisos

- Retratos enviados pelos jogadores ficam em `server/uploads`, no disco da aplicação.
  Um redeploy que apague os arquivos da aplicação apaga também esses retratos.
- O `.env` nunca vai para o GitHub. As senhas ficam só no painel da hospedagem.
