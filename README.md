# Isolde Bot

Bot de Discord em Node.js usando discord.js.

## Como Rodar

1. Instale as dependencias:

```sh
npm install
```

2. Crie o arquivo `.env` com base no exemplo:

```sh
cp .env.example .env
```

3. Configure o `.env`:

```env
DISCORD_TOKEN=seu_token_aqui
WELCOME_CHANNEL_ID=id_do_canal_de_boas_vindas
GOODBYE_CHANNEL_ID=id_do_canal_de_despedida
```

4. Inicie o bot:

```sh
npm start
```

No Discord Developer Portal, ative `Message Content Intent` e `Server Members Intent`.

## Comandos Basicos

```txt
!ping
```

## Musica

```txt
!play link_ou_nome_da_musica
!p link_ou_nome_da_musica
!queue
!fila
!np
!tocando
!pause
!resume
!continuar
!skip
!stop
!volume 1-100
```

Para usar musica, entre em um canal de voz e envie `!play` com um link do YouTube ou uma busca por texto. O bot usa **youtubei.js** (API InnerTube) para resolver e transmitir audio; precisa de **ffmpeg** no PATH para o `@discordjs/voice` transcodificar o stream. Permissoes: `Ver canal`, `Conectar` e `Falar`.

Testes locais (sem Discord):

```sh
node scripts/test-music-resolve.js "https://youtu.be/tq0tUo0e1b8"
node scripts/test-music-stream.js "https://youtu.be/tq0tUo0e1b8"
```

Cookie opcional no `.env` (`YT_COOKIE`) se alguns videos falharem.

## Boas-vindas e Despedida

Configure os IDs no `.env`:

```env
WELCOME_CHANNEL_ID=id_do_canal_de_boas_vindas
GOODBYE_CHANNEL_ID=id_do_canal_de_despedida
```

Se os IDs nao forem configurados, o bot tenta usar o canal de sistema do servidor.

## Sistemas Sociais

Casamento:

```txt
!casar @usuario
!aceitarcasamento
!recusarcasamento
!divorciar
!casamento
!casamento @usuario
```

Pontos:

```txt
!daily
!pontos
!pontos @usuario
!rankpontos
```

## Loja de Pontos

Itens atuais:

```txt
cafe - 50 pontos
amuleto - 150 pontos
mapa - 250 pontos
coroa - 750 pontos
```

Comandos:

```txt
!loja
!shop
!comprar id_do_item
!buy id_do_item
!inventario
!inventario @usuario
!inv
!usar id_do_item
```

As compras usam os pontos do sistema de pontos e ficam salvas no inventario do usuario.

XP por mensagem:

```txt
!xp
!xp @usuario
!level
!rankxp
```

O XP sobe automaticamente quando alguem conversa. Existe um intervalo de 60 segundos por usuario para evitar farm.

## Moderacao

Comandos disponiveis:

```txt
!ban @usuario motivo
!unban id_do_usuario
!kick @usuario motivo
!timeout @usuario 10m motivo
!untimeout @usuario
!warn @usuario motivo
!warnings
!warnings @usuario
!clearwarns @usuario
!clear quantidade
!slowmode segundos
!lock
!unlock
```

Permissoes que o bot pode precisar, dependendo do comando:

```txt
Banir membros
Expulsar membros
Moderar membros
Gerenciar mensagens
Gerenciar canais
```

Para ban, kick e timeout, o cargo do bot precisa estar acima do cargo da pessoa alvo.

## Dados Locais

Os dados de XP, pontos, avisos e casamentos ficam em:

```txt
data/database.json
```

Essa pasta fica fora do Git pelo `.gitignore`.
