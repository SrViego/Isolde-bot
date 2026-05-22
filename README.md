<<<<<<< HEAD
# Isolde-bot
Bot de discord
=======
# Hallownest Bots

Codigo basico para um bot do Discord usando Node.js e discord.js.

## Como rodar

1. Instale as dependencias:

```sh
npm install
```

2. Crie o arquivo `.env` com base no exemplo:

```sh
cp .env.example .env
```

3. Coloque o token do seu bot no `.env`:

```env
DISCORD_TOKEN=seu_token_aqui
WELCOME_CHANNEL_ID=id_do_canal_de_boas_vindas
GOODBYE_CHANNEL_ID=id_do_canal_de_despedida
```

4. Inicie o bot:

```sh
npm start
```

## Teste

Com o bot online no seu servidor, envie:

```txt
!ping
```

Ele deve responder:

```txt
Pong!
```

No portal do Discord, ative a intent `Message Content Intent` para o comando por mensagem funcionar.

Para boas-vindas e despedidas, ative tambem a intent `Server Members Intent`.

## Comandos

```txt
!ping
!play link_do_youtube
!queue
!skip
!stop
```

Para usar musica, entre em um canal de voz e envie `!play` com um link do YouTube.

## Sistemas sociais

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

XP por mensagem:

```txt
!xp
!xp @usuario
!level
!rankxp
```

O XP sobe automaticamente quando alguem conversa. Existe um intervalo de 60 segundos por usuario para evitar farm.
>>>>>>> ca1ccc8 (Initial Discord bot setup)
