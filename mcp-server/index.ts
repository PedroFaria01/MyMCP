// Servidor MCP do Hub Pessoal — a parte que expõe o teu grafo de notas
// pra qualquer assistente de IA compatível com MCP (Claude Desktop, etc.),
// lendo e escrevendo o mesmo arquivo que o app desktop usa
// (data/notas.json). Roda como processo separado, via stdio.
//
// Uso: npm run mcp:server
// (ou aponte o Claude Desktop pra este comando — veja o README)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  lerTodasAsNotas,
  buscarNotas,
  adicionarNota,
  atualizarNota,
  removerNota,
  notasRelacionadas,
  listarTemas,
  adicionarTema,
  renomearTema,
  removerTema,
  resolverCaminhoDeTema,
  acharTemaPorCaminho,
} from '../src/shared/armazenamento.js';
import { montarArvore, notasDoTema, caminhoDoTema } from '../src/shared/temas.js';
import { normalizar } from '../src/shared/texto.js';
import type { NovaNota } from '../src/shared/tipos.js';
import {
  ERRO_TEMA_NAO_ENCONTRADO,
  ordenarPorRecencia,
  pontuarRelevancia,
  descreverImpactoDeRemocao,
  mensagemPreviaRemocaoDeTema,
  mensagemPreviaRemocaoDeNota,
} from './logica.js';

const server = new McpServer({
  name: 'hub-pessoal-mcp',
  version: '0.1.0',
});

// ------------------------------------------------------------------------
// Temas
// ------------------------------------------------------------------------

server.tool(
  'listar_temas',
  'Lista a árvore de temas e subtemas do Hub Pessoal (como o usuário organiza os assuntos), com a contagem de notas de cada um — um tema raiz mostra o total agregado dele com os subtemas. Use antes de buscar/listar/adicionar notas pra entender a organização e descobrir o caminho exato de um tema (ex: "Projetos/Hub Pessoal") a passar nas outras ferramentas.',
  {},
  async () => {
    const temas = listarTemas();
    const notas = lerTodasAsNotas();
    const arvore = montarArvore(temas).map(({ tema, filhos }) => ({
      nome: tema.nome,
      notas: notasDoTema(notas, temas, tema.id).length,
      subtemas: filhos.map((filho) => ({
        nome: filho.nome,
        caminho: caminhoDoTema(temas, filho.id),
        notas: notas.filter((n) => n.temaId === filho.id).length,
      })),
    }));
    const semTema = notas.filter((n) => !n.temaId).length;
    return {
      content: [{ type: 'text', text: JSON.stringify({ temas: arvore, semTema }, null, 2) }],
    };
  },
);

server.tool(
  'criar_tema',
  'Cria um tema ou subtema no Hub Pessoal, sem precisar criar uma nota junto. Idempotente: se já existir um tema com esse nome no mesmo nível, devolve ele em vez de duplicar.',
  {
    nome: z.string().describe('Nome do tema/subtema a criar'),
    temaPai: z
      .string()
      .optional()
      .describe('Caminho do tema pai, ex: "Projetos" (cria se não existir; omite pra criar um tema raiz)'),
  },
  async ({ nome, temaPai }) => {
    const temaPaiId = temaPai ? resolverCaminhoDeTema(temaPai) : null;
    const existente = listarTemas().find(
      (t) => t.temaPaiId === temaPaiId && normalizar(t.nome) === normalizar(nome.trim()),
    );
    const tema = existente ?? adicionarTema({ nome, temaPaiId });
    return { content: [{ type: 'text', text: JSON.stringify(tema, null, 2) }] };
  },
);

server.tool(
  'renomear_tema',
  'Renomeia um tema ou subtema existente do Hub Pessoal.',
  {
    caminho: z.string().describe('Caminho atual do tema, ex: "Projetos/Hub Pessoal"'),
    novoNome: z.string().describe('Novo nome pra esse nível (não é o caminho inteiro, só o nome dele)'),
  },
  async ({ caminho, novoNome }) => {
    const tema = acharTemaPorCaminho(caminho);
    if (!tema) return { content: [{ type: 'text', text: ERRO_TEMA_NAO_ENCONTRADO(caminho) }] };
    const atualizado = renomearTema(tema.id, novoNome);
    return { content: [{ type: 'text', text: JSON.stringify(atualizado, null, 2) }] };
  },
);

server.tool(
  'remover_tema',
  'Remove um tema ou subtema do Hub Pessoal pelo caminho. Chama sem `confirmar` primeiro pra ver o impacto (subtemas e quantas notas seriam afetadas) sem apagar nada; só remove de fato com `confirmar: true`. As notas não são apagadas, só voltam a ficar sem tema — remover um tema raiz remove os subtemas diretos dele junto.',
  {
    caminho: z.string().describe('Caminho do tema a remover, ex: "Projetos/Hub Pessoal"'),
    confirmar: z.boolean().default(false).describe('Só remove de fato quando true; sem isso, só mostra uma prévia do impacto'),
  },
  async ({ caminho, confirmar }) => {
    const tema = acharTemaPorCaminho(caminho);
    if (!tema) return { content: [{ type: 'text', text: ERRO_TEMA_NAO_ENCONTRADO(caminho) }] };

    const { subtemas, notasAfetadas } = descreverImpactoDeRemocao(listarTemas(), lerTodasAsNotas(), tema);

    if (!confirmar) {
      return {
        content: [{ type: 'text', text: mensagemPreviaRemocaoDeTema(caminho, subtemas, notasAfetadas) }],
      };
    }

    removerTema(tema.id);
    return { content: [{ type: 'text', text: `Tema "${caminho}" removido.` }] };
  },
);

// ------------------------------------------------------------------------
// Notas
// ------------------------------------------------------------------------

server.tool(
  'buscar_contexto',
  'Busca notas no Hub Pessoal por texto livre — procura no título e no conteúdo, com o título pesando mais no ranking. Use pra responder perguntas sobre a vida diária do usuário (gastos, compromissos, ideias, etc.). Passe `tema` pra restringir a busca a um assunto específico e `limite` pra cortar o tamanho da resposta.',
  {
    consulta: z.string().describe('Texto a procurar, ex: "manutenção do carro"'),
    tema: z
      .string()
      .optional()
      .describe('Caminho do tema pra restringir a busca, ex: "Projetos" ou "Projetos/Hub Pessoal"'),
    limite: z.number().int().positive().optional().describe('Máximo de resultados a devolver, os mais relevantes primeiro'),
  },
  async ({ consulta, tema, limite }) => {
    let resultados = buscarNotas(consulta);

    if (tema) {
      const encontrado = acharTemaPorCaminho(tema);
      if (!encontrado) {
        return { content: [{ type: 'text', text: ERRO_TEMA_NAO_ENCONTRADO(tema) }] };
      }
      const idsDoTema = new Set(notasDoTema(lerTodasAsNotas(), listarTemas(), encontrado.id).map((n) => n.id));
      resultados = resultados.filter((n) => idsDoTema.has(n.id));
    }

    resultados = resultados.sort(
      (a, b) =>
        pontuarRelevancia(b, consulta) - pontuarRelevancia(a, consulta) ||
        new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime(),
    );
    if (limite) resultados = resultados.slice(0, limite);

    return {
      content: [{ type: 'text', text: JSON.stringify(resultados, null, 2) }],
    };
  },
);

server.tool(
  'listar_notas',
  'Lista notas do Hub Pessoal, as mais recentes primeiro. Sem `tema`, lista tudo — use `limite` pra não estourar o contexto, ou prefira buscar_contexto/passar um tema quando souber o assunto. Com `tema`, lista só as notas daquele tema/subtema (um tema raiz também traz as notas dos subtemas dele).',
  {
    tema: z.string().optional().describe('Caminho do tema pra filtrar, ex: "Projetos" ou "Projetos/Hub Pessoal"'),
    limite: z.number().int().positive().optional().describe('Máximo de notas a devolver, as mais recentes primeiro'),
  },
  async ({ tema, limite }) => {
    const todasNotas = lerTodasAsNotas();
    let notas = todasNotas;

    if (tema) {
      const encontrado = acharTemaPorCaminho(tema);
      if (!encontrado) {
        return { content: [{ type: 'text', text: ERRO_TEMA_NAO_ENCONTRADO(tema) }] };
      }
      notas = notasDoTema(todasNotas, listarTemas(), encontrado.id);
    }

    notas = ordenarPorRecencia(notas);
    if (limite) notas = notas.slice(0, limite);

    return { content: [{ type: 'text', text: JSON.stringify(notas, null, 2) }] };
  },
);

server.tool(
  'notas_relacionadas',
  'Mostra as notas ligadas a uma nota pelo link [[Nome]]: pra quais ela linka (linkaPara) e quais linkam pra ela (linkadaPor). Use pra puxar o fio de um assunto a partir de uma nota específica.',
  { id: z.string().describe('ID da nota') },
  async ({ id }) => {
    const { paraFora, paraDentro } = notasRelacionadas(id);
    return {
      content: [{ type: 'text', text: JSON.stringify({ linkaPara: paraFora, linkadaPor: paraDentro }, null, 2) }],
    };
  },
);

server.tool(
  'adicionar_nota',
  'Cria uma nova nota no Hub Pessoal — use pra guardar algo que o usuário mencionou e vale a pena lembrar depois.',
  {
    titulo: z.string().describe('Título curto da nota'),
    conteudo: z.string().default('').describe('Conteúdo da nota'),
    tema: z
      .string()
      .optional()
      .describe('Caminho do tema pra categorizar, ex: "Financas" ou "Projetos/Hub Pessoal" (cria se não existir)'),
    links: z.array(z.string()).optional().describe('IDs de outras notas relacionadas'),
  },
  async ({ titulo, conteudo, tema, links }) => {
    const temaId = tema ? resolverCaminhoDeTema(tema) : null;
    const nota = adicionarNota({ titulo, conteudo, temaId, links });
    return {
      content: [{ type: 'text', text: JSON.stringify(nota, null, 2) }],
    };
  },
);

server.tool(
  'atualizar_nota',
  'Atualiza uma nota existente no Hub Pessoal — corrige ou expande o conteúdo, troca o tema ou os links, sem precisar apagar e recriar. Só os campos passados são alterados.',
  {
    id: z.string().describe('ID da nota a atualizar'),
    titulo: z.string().optional().describe('Novo título (omite pra manter o atual)'),
    conteudo: z.string().optional().describe('Novo conteúdo (omite pra manter o atual)'),
    tema: z
      .string()
      .optional()
      .describe(
        'Novo caminho de tema, ex: "Projetos/Hub Pessoal" (cria se não existir); passe "" pra tirar a nota do tema atual; omite pra manter',
      ),
    links: z.array(z.string()).optional().describe('Substitui a lista de IDs linkados (omite pra manter)'),
  },
  async ({ id, titulo, conteudo, tema, links }) => {
    const alteracoes: Partial<NovaNota> = {};
    if (titulo !== undefined) alteracoes.titulo = titulo;
    if (conteudo !== undefined) alteracoes.conteudo = conteudo;
    if (links !== undefined) alteracoes.links = links;
    if (tema !== undefined) alteracoes.temaId = tema === '' ? null : resolverCaminhoDeTema(tema);

    const atualizada = atualizarNota(id, alteracoes);
    if (!atualizada) {
      return { content: [{ type: 'text', text: `Nota "${id}" não encontrada.` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(atualizada, null, 2) }] };
  },
);

server.tool(
  'remover_nota',
  'Remove uma nota do Hub Pessoal pelo ID. Chama sem `confirmar` primeiro pra ver uma prévia sem apagar nada; só remove de fato com `confirmar: true`.',
  {
    id: z.string().describe('ID da nota a remover'),
    confirmar: z.boolean().default(false).describe('Só remove de fato quando true; sem isso, só mostra uma prévia'),
  },
  async ({ id, confirmar }) => {
    const nota = lerTodasAsNotas().find((n) => n.id === id);
    if (!nota) return { content: [{ type: 'text', text: `Nota "${id}" não encontrada.` }] };

    if (!confirmar) {
      return { content: [{ type: 'text', text: mensagemPreviaRemocaoDeNota(nota) }] };
    }

    removerNota(id);
    return { content: [{ type: 'text', text: `Nota "${nota.titulo}" removida.` }] };
  },
);

// Função async em vez de top-level await: o pacote não tem "type": "module"
// (isso é de propósito — veja o comentário no vite.config.ts sobre o
// preload do Electron), então este arquivo roda como CommonJS, que não
// aceita await solto no topo do arquivo.
async function principal() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

principal().catch((erro) => {
  console.error('Falha ao iniciar o servidor MCP:', erro);
  process.exit(1);
});
