# 🎬 Reels Manager — Painel Local de Publicação Automatizada

Aplicativo web **100% local** para gerenciar uma fila de vídeos e publicá-los
automaticamente como Reels do Instagram, em horários definidos por você,
usando automação de navegador (Playwright) — **sem IA generativa** e **sem a
API oficial do Instagram**.

---

## ⚠️ Avisos importantes

- Este projeto **não burla** CAPTCHA, 2FA ou qualquer mecanismo de segurança
  do Instagram. Quando o Instagram exigir verificação, a automação **pausa**
  e pede que você resolva manualmente na janela do navegador.
- A automação de contas pode violar os **Termos de Uso do Instagram/Meta** e
  gerar bloqueios, limitações ou banimento da conta. Use por sua conta e
  risco, com moderação (evite volumes agressivos de publicações).
- Sua senha do Instagram **nunca** é solicitada, digitada, capturada ou
  armazenada por este aplicativo. O login é sempre feito manualmente por
  você, dentro da janela real do navegador.

---

## 🧱 Stack utilizada

| Camada        | Tecnologia                          |
|---------------|--------------------------------------|
| Frontend      | React + Vite                        |
| Backend       | Node.js + Express                   |
| Automação     | Playwright (Chromium)               |
| Banco local   | SQLite                              |
| ORM           | Prisma                              |
| Upload        | Multer (arquivos locais em `/videos`) |

Nenhum serviço externo é necessário além do próprio Instagram, acessado pelo
navegador controlado pelo Playwright.

---

## 📁 Estrutura do projeto

```
instagram-reels-manager/
├── server/                    # Backend (Express)
│   ├── index.js                # Ponto de entrada da API
│   ├── routes/                 # Endpoints REST (videos, schedule, settings, reelEditor...)
│   ├── services/                # Regras de negócio (fila, agendador, logger, editor em massa...)
│   ├── playwright/              # Automação: seletores + gerenciador de navegador
│   ├── db/                      # Cliente Prisma
│   └── utils/                   # Utilitários (metadados de vídeo)
├── client/                    # Frontend (React + Vite)
│   └── src/
│       ├── pages/                # Dashboard, Fila, Editor em Massa, Calendário, Horários...
│       ├── components/           # Sidebar, badges...
│       └── api/                  # Cliente Axios + formatação
├── prisma/
│   └── schema.prisma            # Modelos: UserSettings, Video, Publication, Schedule, Log,
│                                 # VideoTemplate, ProcessingJob, ProcessedVideo, EditorSourceVideo
├── videos/
│   ├── pending/                  # Vídeos aguardando publicação
│   ├── published/                # Vídeos já publicados (nunca excluídos)
│   ├── failed/                   # Vídeos que falharam após 3 tentativas
│   ├── editor-source/            # Vídeos originais enviados ao Editor em Massa
│   ├── editor-output/            # Vídeos já processados por um template
│   └── editor-assets/            # Fotos de perfil, logos e fundos do Editor em Massa
├── playwright/
│   └── session/                  # Sessão do navegador (storageState.json) — local, nunca é senha
├── .env.example
└── package.json
```

---

## 🚀 Como rodar

### 1. Pré-requisitos

- Node.js 18 ou superior
- NPM

### 2. Instalação

```bash
npm install
```

Esse comando instala as dependências do backend **e** do frontend
automaticamente (via `postinstall`), além de baixar o navegador Chromium
usado pelo Playwright. Se o download do Chromium falhar por algum motivo,
rode manualmente:

```bash
npx playwright install chromium
```

### 3. Banco de dados

```bash
npm run prisma:migrate
```

Isso cria o arquivo SQLite em `data/app.db` com todas as tabelas
(`UserSettings`, `Video`, `Publication`, `Schedule`, `Log`, `VideoTemplate`,
`ProcessingJob`, `ProcessedVideo`, `EditorSourceVideo`).

> Se você já tinha o app instalado antes do **Editor em Massa** existir,
> rode `npm install` (para regenerar o Prisma Client com os novos modelos)
> e depois `npm run prisma:migrate` novamente — a migração é aditiva e não
> apaga nenhum dado existente.

### 4. Rodar em desenvolvimento

```bash
npm run dev
```

Isso sobe **backend (porta 3001)** e **frontend (porta 3000)** juntos.
Acesse o painel em:

```
http://localhost:3000
```

### Scripts disponíveis

| Script                    | O que faz                                              |
|---------------------------|---------------------------------------------------------|
| `npm run dev`              | Sobe backend + frontend juntos (desenvolvimento)        |
| `npm run server`           | Sobe apenas o backend (porta 3001)                       |
| `npm run client`           | Sobe apenas o frontend (porta 3000)                       |
| `npm run prisma:migrate`   | Cria/atualiza o banco SQLite a partir do schema Prisma    |
| `npm run prisma:studio`    | Abre o Prisma Studio (visualizar/editar dados do banco)   |
| `npm run build`            | Gera o build de produção do frontend                       |
| `npm run start`            | Roda o backend em modo produção servindo o build do React |

---

## 🖥️ Usando o painel

### 1. Conectar o Instagram

Vá em **Instagram** no menu lateral e clique em **"Conectar Instagram"**.
Uma janela real do Chromium será aberta. Faça login normalmente — incluindo
qualquer 2FA ou verificação que aparecer. Assim que o login for concluído, a
sessão é salva em `playwright/session/storageState.json` e reutilizada
automaticamente nas próximas publicações. Você não precisa logar novamente,
a menos que desconecte manualmente ou a sessão expire.

### 2. Adicionar vídeos à fila

Vá em **Fila de vídeos** e arraste (ou selecione) vários arquivos de vídeo
de uma vez. Cada vídeo mostra miniatura, nome, duração e tamanho. Você pode:

- Reordenar arrastando as linhas (define a ordem de publicação)
- Visualizar o vídeo em um player
- Editar a legenda individual de cada vídeo
- Selecionar vários vídeos (checkbox por vídeo ou "Selecionar todos") e
  excluí-los de uma vez em "Excluir selecionados"
- Remover vídeos da fila (exceto os já publicados)

### 3. Definir a capa personalizada de cada vídeo

Em cada vídeo da fila (aba **Fila de vídeos**), a seção "Foto da capa"
permite escolher uma imagem (JPG, JPEG, PNG ou WEBP) do computador para usar
como capa do Reel. Ao selecionar uma imagem, você escolhe se ela vale
"Somente neste vídeo" ou "Em todos os vídeos da fila" (aplica a todos os
pendentes, nunca aos já publicados). Também é possível configurar uma
**capa padrão** em Configurações, aplicada automaticamente a novos vídeos
adicionados à fila. Capas são removidas do disco automaticamente quando o
vídeo é publicado ou excluído — mas só se nenhum outro vídeo (ou a capa
padrão) ainda precisar do mesmo arquivo.

### 4. Definir a legenda padrão

Em **Configurações**, escreva a legenda padrão e marque "Usar legenda padrão
em todos os vídeos". Vídeos com legenda individual definida sempre usam a
própria legenda, mesmo com essa opção ativa.

### 5. Definir os horários

Em **Horários**, escolha o modo de agendamento:

- **Horários específicos** — cadastre quantos horários quiser (ex: 12:00,
  14:00, 16:00, 18:00, 21:00). O sistema valida que não existam horários
  duplicados e você pode ativar/desativar cada um sem removê-lo.
- **A cada X minutos** — publique em intervalos fixos (1, 2, 5, 10, 15, 30,
  60 minutos, ou qualquer valor digitado), começando agora ou em um horário
  específico. Os vídeos pendentes da fila são distribuídos automaticamente
  nesse intervalo, na ordem em que aparecem.

Só um modo fica ativo por vez — trocar de modo ou mudar o intervalo
recalcula os agendamentos futuros automaticamente (nunca mexe no que já foi
publicado).

### 6. Iniciar a automação

No **Dashboard**, clique em **▶ Iniciar automação**. A partir daí, o sistema
verifica continuamente (a cada ~15s) se algum horário chegou e, em caso
positivo, publica automaticamente o próximo vídeo pendente da fila.

- 🟢 **Ativa** — publicando normalmente conforme os horários
- 🔴 **Pausada** — nada será publicado até retomar
- 🟡 **Aguardando intervenção** — o Instagram pediu verificação de segurança;
  resolva na janela do navegador e clique em "Já resolvi, continuar"

### 7. Acompanhar

- **Dashboard**: saudação muda conforme o horário (bom dia/boa tarde/boa
  noite); botão "Resetar dashboard" limpa o histórico de erros exibido ali
  (não afeta vídeos, agendamentos ou configurações)
- **Calendário**: visão dia a dia de tudo que está agendado/publicado
- **Histórico**: lista de todas as publicações com tentativas e erros
- **Logs**: log detalhado de cada ação do sistema, em tempo real
- **Configurações → Armazenamento**: tamanho ocupado por vídeos, capas e
  cache; botão "Limpar cache" (com limpeza automática opcional)
- **Configurações → Zona de risco**: limpa o conteúdo de qualquer pasta de
  arquivos (pendentes, falhados, publicados, capas, e as pastas do Editor em
  Massa) individualmente ou tudo de uma vez — sempre com confirmação antes

---

## 🪄 Editor em Massa (templates de Reels)

Página **Editor em Massa** no menu lateral. Permite configurar um template
visual uma única vez e aplicá-lo automaticamente a 1, 10, 100 ou 500 vídeos,
gerando Reels prontos de 1080×1920 sem cortar, sem distorcer e preservando o
áudio original.

### Como funciona

1. **Monte um template**: foto de perfil, nome, selo de verificado,
   username, título/chamada, container de vídeo (posição, tamanho, borda
   arredondada, sombra), fundo (cor, gradiente, imagem ou fundo desfocado
   dinâmico) e marca d'água opcional. O preview à direita usa o vídeo real
   selecionado, não uma imagem estática.
2. **Salve o template** (botão "Salvar alterações"). Templates ficam
   disponíveis para reuso e podem ser duplicados.
3. **Envie os vídeos de origem** (arraste 1 a 500 arquivos) e marque quais
   serão processados.
4. **Escolha o modo de ajuste do vídeo**:
   - **Encaixar sem cortar** (padrão) — nunca corta cabeça, rosto, texto ou
     legendas incrustadas; redimensiona proporcionalmente e usa o fundo
     configurado para preencher o espaço excedente.
   - **Preencher cortando** — opção explícita, corta o excedente para
     preencher o container inteiro.
   - **Fundo desfocado** — encaixa sem cortar, com uma cópia borrada do
     próprio vídeo preenchendo o espaço ao redor.
5. **Clique em "Processar N vídeos"**. O processamento roda em uma fila
   própria (independente da fila de publicação), com concorrência
   configurável (1 a 4 vídeos simultâneos), barra de progresso por vídeo e
   botão de cancelamento a qualquer momento (arquivos já concluídos são
   mantidos; só os pendentes são cancelados).
6. **Envie os resultados para a fila existente** com um clique ("Adicionar
   todos à fila") — os vídeos processados entram na mesma fila de
   publicação (`/fila`), com as mesmas opções de agendamento automático já
   existentes no app. Nenhuma fila ou scheduler duplicado é criado.

### Como o vídeo é processado (FFmpeg)

O redimensionamento usa a mesma matemática de "encaixe" em todos os casos —
`scale = min(larguraContainer/larguraVídeo, alturaContainer/alturaVídeo)` —
garantindo que a proporção original nunca seja distorcida. O header, título
e marca d'água são renderizados uma única vez por lote (via Chromium
headless, reaproveitando o Playwright que o projeto já usa para a
automação do Instagram) e depois compostos em cada vídeo pelo FFmpeg junto
com o fundo e a máscara de cantos arredondados. O processamento roda
**100% localmente** — nenhum vídeo é enviado para serviços externos.

### Pastas usadas pelo Editor em Massa

```
videos/
├── editor-source/    # vídeos originais enviados ao editor (biblioteca própria)
├── editor-output/    # vídeos já processados pelo template
├── editor-assets/    # fotos de perfil, logos e imagens de fundo enviadas
└── editor-tmp/       # PNGs intermediários de um lote (limpos ao final do job)
```

---

## 🔁 Fluxo de publicação e tentativas

1. O agendador identifica um horário vencido com vídeo atribuído.
2. Chama `InstagramPublisher`, que reutiliza a sessão salva, abre o fluxo de
   criação de Reel, seleciona o vídeo, preenche a legenda e clica em
   compartilhar.
3. A publicação **só é considerada concluída** quando um indicador
   observável de sucesso aparece na tela (nunca apenas por ter clicado no
   botão).
4. Se falhar, tenta novamente — até **3 tentativas** (configurável via
   `MAX_ATTEMPTS` no `.env`).
5. Se todas as tentativas falharem, o vídeo é movido para `/videos/failed`,
   o erro fica registrado no banco e no Dashboard, e **a automação inteira é
   pausada** — o sistema nunca avança silenciosamente para o próximo vídeo
   após uma falha definitiva.

Os vídeos publicados com sucesso são movidos para `/videos/published` — o
arquivo **nunca é excluído** automaticamente.

---

## 🧩 Manutenção da automação (seletores do Instagram)

A interface do Instagram muda com frequência. Toda a lógica de seletores
está centralizada em:

```
server/playwright/selectors.js
```

Se a publicação parar de funcionar (ex: "Botão não encontrado"), esse é o
único arquivo que normalmente precisa de ajuste — não é necessário mexer na
lógica de `server/services/instagramPublisher.js`.

Dica: use `npx playwright codegen instagram.com` para inspecionar os
seletores atuais da interface.

---

## 🔐 Segurança e privacidade

- Nenhuma senha é solicitada, lida ou armazenada pelo app.
- O login é sempre manual, feito por você, na janela real do navegador.
- A sessão fica salva **apenas no seu computador**
  (`playwright/session/storageState.json`) — nunca é enviada para nenhum
  servidor externo.
- O app não tenta identificar, automatizar ou burlar CAPTCHA, 2FA ou
  qualquer outro mecanismo de segurança da Meta. Ao detectar uma dessas
  telas, a automação simplesmente pausa e aguarda você.

---

## 🗄️ Modelos de dados (Prisma)

- **UserSettings** — legenda padrão, uso de legenda padrão, publicações por
  dia, automação ligada/desligada, status da automação, capa padrão
  (`defaultCoverPath`/`useDefaultCover`)
- **Video** — arquivo, status (`PENDING`/`SCHEDULED`/`PUBLISHING`/`PUBLISHED`/`FAILED`),
  posição na fila, legenda, datas, capa individual (`coverPath`/`coverEnabled`)
- **Publication** — vínculo entre um vídeo e um horário agendado, com
  tentativas e mensagem de erro
- **Schedule** — horário recorrente (`HH:mm`) e se está ativo
- **Log** — histórico de eventos do sistema
- **VideoTemplate** — template visual do Editor em Massa (header, título,
  container de vídeo, fundo, marca d'água, áudio, exportação)
- **ProcessingJob** — um lote de processamento em massa (N vídeos + 1 template)
- **ProcessedVideo** — um vídeo individual dentro de um `ProcessingJob`
- **EditorSourceVideo** — biblioteca de vídeos originais enviados ao Editor
  em Massa (independente da fila de publicação)

---

## ✅ Checklist de testes manuais sugerido

1. Adicionar múltiplos vídeos de uma vez
2. Reordenar a fila arrastando
3. Definir legenda padrão e marcar "usar em todos"
4. Cadastrar 5 horários (ex: 12:00, 14:00, 16:00, 18:00, 21:00)
5. Conferir se o Calendário gerou os agendamentos automaticamente
6. Conectar o Instagram (login manual)
7. Iniciar a automação e aguardar o primeiro horário
8. Confirmar que o vídeo foi movido de `/pending` para `/published`
9. Conferir o registro da publicação em Histórico e Logs
10. Simular uma falha (ex: desconectar o Instagram) e ver o comportamento de
    retentativa + pausa após 3 falhas
11. Testar Pausar / Retomar
12. Reiniciar o app (`Ctrl+C` e `npm run dev` novamente) e confirmar que fila,
    agendamentos, configurações e histórico continuam salvos
13. Definir uma capa individual em um vídeo e confirmar a prévia
14. Aplicar uma capa "em todos os vídeos da fila" e confirmar que só os
    pendentes foram atualizados
15. Configurar uma capa padrão, ativar "usar capa padrão para novos vídeos" e
    enviar um vídeo novo para conferir se ele já entra com a capa
16. Selecionar vários vídeos com os checkboxes, usar "Selecionar todos" e
    "Excluir selecionados" e confirmar que os arquivos (vídeo + capa, se não
    usada em outro lugar) somem do disco

---

## 🛠️ Variáveis de ambiente (`.env`)

| Variável                | Padrão                     | Descrição                                                        |
|--------------------------|-----------------------------|--------------------------------------------------------------------|
| `PORT`                    | `3001`                      | Porta do backend                                                    |
| `DATABASE_URL`            | `file:./data/app.db`        | Conexão do SQLite usada pelo Prisma                                 |
| `VIDEOS_DIR`               | `./videos`                  | Pasta raiz de pending/published/failed                              |
| `SESSION_DIR`              | `./playwright/session`      | Onde a sessão autenticada do navegador é salva                      |
| `HEADLESS`                 | `false`                     | Se `true`, roda o navegador sem interface (não recomendado)         |
| `SCHEDULER_INTERVAL_MS`     | `15000`                     | Intervalo de verificação do agendador                               |
| `MAX_ATTEMPTS`              | `3`                          | Tentativas por vídeo antes de mover para `/failed`                 |
| `KEEP_BROWSER_OPEN`          | `false`                      | Mantém o navegador aberto entre publicações                        |

---

## 📄 Licença

Projeto de uso pessoal/local. Adapte livremente conforme sua necessidade.
