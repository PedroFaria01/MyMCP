# Hub Pessoal MCP

Fase 1 do projeto: um app desktop (Electron + React + TypeScript) que guarda
notas do dia a dia organizadas por temas e subtemas — ao estilo pastas — com
links soltos entre notas ao estilo Obsidian, e um servidor MCP que expõe
tudo isso pra qualquer assistente de IA compatível (Claude Desktop, por
exemplo), tudo rodando 100% local, sem nuvem.

## Como rodar o app desktop

```bash
npm install
npm run dev
```

Isso abre a janela do Electron com hot-reload ligado. Na primeira vez já
vem um punhado de notas de exemplo linkadas entre si, pra você ver o app
funcionando sem precisar digitar nada.

- **Barra lateral esquerda**: a árvore de temas. `+ Novo tema` cria um tema
  de nível raiz (ex: "Pagamentos"); passa o mouse num tema e clica `+` pra
  criar um subtema dentro dele (ex: "Projetos" → "Hub Pessoal"). Duplo
  clique no nome renomeia; o `×` remove (com confirmação) — as notas de um
  tema removido não são apagadas, só voltam a ficar "sem tema". **Arrasta
  um tema ou subtema** pra reordenar a lista do teu jeito — a ordem fica
  salva. Só dá pra arrastar dentro do mesmo grupo (temas de raiz entre si,
  subtemas de um mesmo pai entre si), não pra virar filho de outro tema.
- **Clica** num tema (ou subtema) pra ver, no meio, tudo que está
  relacionado a ele. Clicar num tema raiz agrega as notas dos subtemas
  também. Sem nada selecionado, o meio mostra a visão geral com um cartão
  por tema e a contagem de notas.
- Na barra de captura (embaixo, centro), escreve algo e aperta `Enter` — a
  nota nova entra automaticamente no tema selecionado. Use
  `[[Nome de outra nota]]` no meio do texto pra criar um link — se a nota
  ainda não existir, ela é criada automaticamente (igual ao Obsidian).
- No painel de detalhe (direita), dá pra trocar o tema de uma nota a
  qualquer momento pelo seletor abaixo do título. O conteúdo mostra os
  trechos que viraram link como texto clicável (clica em qualquer outro
  lugar do conteúdo pra editar); "Linka para" e "Linkado por" listam as
  notas conectadas, com um `×` pra desvincular sem apagar nada. `[[Nome]]`
  funciona tanto na barra de captura quanto editando o conteúdo de uma nota
  já existente — nos dois casos cria a nota referenciada se ela ainda não
  existir. O `+` ao lado de "Linka para" abre um dropdown com busca pra
  linkar uma nota já existente sem precisar digitar `[[Nome]]` no texto.
  URLs `http(s)://` soltas no conteúdo também viram link clicável, abrindo
  no navegador padrão do sistema (nunca dentro da janela do app).
- Botão **Selecionar** no topo da grade de notas liga um modo de seleção
  múltipla — marca várias notas e usa o seletor "Mover para…" que aparece
  pra trocar o tema de todas de uma vez.
- Atalhos: `Ctrl+K` foca a busca, `Ctrl+N` foca a barra de captura, `Esc`
  fecha o painel de detalhe.

## Como rodar o servidor MCP

```bash
npm run mcp:server
```

Ele lê e escreve o mesmo arquivo que o app desktop usa
(`data/notas.json`), então o que você adiciona por um lado aparece no
outro. Pra conectar no Claude Desktop, adiciona isto no
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hub-pessoal": {
      "command": "npx",
      "args": ["tsx", "/caminho/completo/para/hub-pessoal-mcp/mcp-server/index.ts"]
    }
  }
}
```

Ferramentas expostas:

**Temas**
- `listar_temas` — devolve a árvore de temas/subtemas com a contagem de
  notas de cada um (tema raiz já vem com o total agregado dos subtemas).
  Chama essa primeiro: é como a IA descobre a organização do usuário e o
  caminho exato (ex: `"Projetos/Hub Pessoal"`) pra usar nas outras
  ferramentas.
- `criar_tema` — cria um tema ou subtema sem precisar criar nota junto;
  idempotente (não duplica se já existir um com o mesmo nome no mesmo nível).
- `renomear_tema` — renomeia um tema/subtema existente, pelo caminho.
- `remover_tema` — remove um tema/subtema pelo caminho; as notas que
  estavam nele não são apagadas, só voltam a ficar sem tema. Chama sem
  `confirmar` primeiro pra ver o impacto (subtemas e quantas notas seriam
  afetadas); só remove de fato com `confirmar: true`.

**Notas**
- `buscar_contexto` — busca por texto livre no título/conteúdo, sem se
  importar com acento (título pesa mais no ranking); aceita `tema`
  opcional pra restringir a busca a um assunto e `limite` pra cortar o
  tamanho da resposta.
- `listar_notas` — lista notas, as mais recentes primeiro; sem `tema` lista
  tudo (use `limite` pra não estourar o contexto), com `tema` filtra só
  aquele assunto (um tema raiz traz também as notas dos subtemas).
- `notas_relacionadas` — dado o ID de uma nota, mostra pra quais notas ela
  linka e quais linkam pra ela (os dois lados do `[[Nome]]`), pra puxar o
  fio de um assunto.
- `adicionar_nota` — cria uma nota; o `tema` aceita o mesmo formato de
  caminho, mas aqui ele **cria** o tema/subtema automaticamente se ainda
  não existir.
- `atualizar_nota` — corrige/expande uma nota existente (título, conteúdo,
  tema ou links) sem precisar apagar e recriar; só os campos passados são
  alterados, e `tema: ""` tira a nota do tema atual.
- `remover_nota` — remove uma nota pelo ID. Chama sem `confirmar` primeiro
  pra ver uma prévia sem apagar nada; só remove de fato com
  `confirmar: true`.

Um caminho de tema que não existe (nas ferramentas que só leem, não criam)
retorna um aviso pedindo pra chamar `listar_temas` primeiro, em vez de
inventar resultado.

## Estrutura do projeto

```
hub-pessoal-mcp/
  src/
    main/        → processo principal do Electron (janela + IPC)
    preload/      → ponte segura entre o main e a interface
    renderer/     → a interface (React): árvore de temas, grade de notas, etc.
    shared/       → tipos e a camada de armazenamento, usados por todo mundo
  mcp-server/      → servidor MCP standalone (roda separado do app)
  data/notas.json  → onde tudo fica salvo (JSON simples, fácil de inspecionar)
  data/backups/    → cópias automáticas antes de cada escrita (as 5 mais recentes)
```

## Decisões da Fase 1 (e o que fica pra depois)

- **Armazenamento em JSON**, não SQLite ainda — dá pra ler com o olho e
  não exige compilar dependência nativa. Fase 2 troca por SQLite +
  `sqlite-vec` sem mudar a API de `src/shared/armazenamento.ts`.
- **Sem OCR nem captura de recibos ainda** — isso é a Fase 2.
- **Sem app mobile ainda** — isso é a Fase 3, com sync via rede local.
- **UI**: tema neumórfico escuro com roxo `#7c6cf0`, notas organizadas por
  temas/subtemas hierárquicos (2 níveis, reordenáveis por drag-and-drop) em
  vez de tags soltas.
- **Backup automático**: cada escrita em `data/notas.json` primeiro copia o
  estado atual pra `data/backups/`, mantendo as últimas 5 versões — recupera
  de uma migração com bug ou uma remoção em cascata que deu errado.
- **Busca sem acento**: tanto a busca da interface quanto `buscar_contexto`
  ignoram acentuação ("financas" acha "Finanças").

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | roda o app desktop com hot-reload |
| `npm run build` | gera o instalador (`.dmg`/`.exe`/`.AppImage`) |
| `npm run mcp:server` | roda só o servidor MCP, via stdio |
| `npm run typecheck` | checa os tipos do projeto inteiro |
| `npm test` | roda todos os testes: armazenamento/temas/migração/backup (`src/shared`), lógica do MCP (`mcp-server`) e componentes React (`src/renderer`, via Testing Library + jsdom) |
| `npm run test:watch` | mesma coisa, em modo watch |
