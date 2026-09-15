// Camada de armazenamento — compartilhada entre o processo principal do
// Electron e o servidor MCP standalone, pra que os dois leiam e escrevam
// exatamente o mesmo arquivo de notas.
//
// MVP: guarda tudo num JSON local (data/notas.json). Isso é de propósito —
// fácil de inspecionar, fácil de dar `git diff`, zero dependência nativa
// pra compilar. Quando o volume de notas crescer, a Fase 2 troca isso por
// SQLite + sqlite-vec sem mudar a API destas funções.

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { BancoDeNotas, Nota, NovaNota, NovoTema, Tema } from './tipos.js';
import { normalizar } from './texto.js';
import { notasRelacionadas as calcularNotasRelacionadas } from './notas.js';

// Sobe diretórios a partir daqui até achar o package.json do projeto.
// Assim o caminho dos dados funciona tanto rodando via `tsx` (a partir de
// src/) quanto rodando o bundle já compilado do Electron (dist-electron/),
// sem precisar contar níveis de pasta manualmente.
function encontrarRaizDoProjeto(partindoDe: string): string {
  let atual = partindoDe;
  while (!existsSync(join(atual, 'package.json'))) {
    const acima = dirname(atual);
    if (acima === atual) return partindoDe; // chegou na raiz do disco, desiste
    atual = acima;
  }
  return atual;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ_DO_PROJETO = encontrarRaizDoProjeto(__dirname);
const MAX_BACKUPS = 5;

// Lidos em cada chamada (não como const de módulo) pra que os testes possam
// apontar `HUB_PASTA_DADOS` pra uma pasta temporária sem nunca tocar nos
// dados reais do usuário — um `import` estático já rodaria antes de qualquer
// `process.env.X = ...` no topo do arquivo de teste, então isso só funciona
// se for avaliado tarde (dentro da função), não uma vez só no carregamento.
function pastaDados(): string {
  return process.env.HUB_PASTA_DADOS || join(RAIZ_DO_PROJETO, 'data');
}

function caminhoDados(): string {
  return join(pastaDados(), 'notas.json');
}

function pastaBackups(): string {
  return join(pastaDados(), 'backups');
}

function garantirArquivo(): void {
  const caminho = caminhoDados();
  if (!existsSync(caminho)) {
    mkdirSync(dirname(caminho), { recursive: true });
    const vazio: BancoDeNotas = { notas: [], temas: [] };
    writeFileSync(caminho, JSON.stringify(vazio, null, 2), 'utf-8');
  }
}

/**
 * Copia o arquivo de dados atual pra `data/backups/` antes de sobrescrevê-lo,
 * e mantém só os `MAX_BACKUPS` mais recentes. É a rede de segurança contra
 * uma migração com bug ou uma remoção em cascata que dá errado — sem isso, um
 * arquivo JSON único não tem como voltar atrás.
 */
function fazerBackup(): void {
  const caminho = caminhoDados();
  if (!existsSync(caminho)) return;

  const pasta = pastaBackups();
  mkdirSync(pasta, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(caminho, join(pasta, `notas-${carimbo}.json`));

  const arquivos = readdirSync(pasta)
    .filter((f) => f.startsWith('notas-') && f.endsWith('.json'))
    .sort(); // nomes com carimbo ISO ordenam cronologicamente
  for (const antigo of arquivos.slice(0, Math.max(0, arquivos.length - MAX_BACKUPS))) {
    rmSync(join(pasta, antigo));
  }
}

/**
 * Migra o formato antigo (notas com `tags: string[]`, sem temas) pro novo
 * modelo hierárquico: a primeira tag de cada nota vira (ou reaproveita) um
 * tema de nível raiz. Notas sem tags ficam "sem tema" (temaId: null).
 * Bancos que já estão no formato novo passam direto, sem custo.
 */
function migrarSeNecessario(bruto: any): { banco: BancoDeNotas; mudou: boolean } {
  const notasBrutas: any[] = Array.isArray(bruto?.notas) ? bruto.notas : [];
  const temas: Tema[] = Array.isArray(bruto?.temas) ? [...bruto.temas] : [];
  let mudou = !Array.isArray(bruto?.temas);

  const temaIdPorNomeRaiz = new Map<string, string>();
  for (const tema of temas) {
    if (tema.temaPaiId === null) temaIdPorNomeRaiz.set(normalizar(tema.nome), tema.id);
  }

  const notas: Nota[] = notasBrutas.map((notaBruta) => {
    if (notaBruta.temaId !== undefined) {
      return notaBruta as Nota;
    }

    mudou = true;
    const primeiraTag: string | undefined = notaBruta.tags?.[0];
    let temaId: string | null = null;

    if (primeiraTag) {
      const chave = normalizar(primeiraTag);
      let id = temaIdPorNomeRaiz.get(chave);
      if (!id) {
        id = randomUUID();
        temas.push({ id, nome: primeiraTag, temaPaiId: null, criadoEm: new Date().toISOString() });
        temaIdPorNomeRaiz.set(chave, id);
      }
      temaId = id;
    }

    return {
      id: notaBruta.id,
      titulo: notaBruta.titulo,
      conteudo: notaBruta.conteudo,
      temaId,
      links: notaBruta.links ?? [],
      criadoEm: notaBruta.criadoEm,
      atualizadoEm: notaBruta.atualizadoEm,
    };
  });

  return { banco: { notas, temas }, mudou };
}

function lerBanco(): BancoDeNotas {
  garantirArquivo();
  const conteudo = readFileSync(caminhoDados(), 'utf-8');
  const bruto = JSON.parse(conteudo);
  const { banco, mudou } = migrarSeNecessario(bruto);
  if (mudou) salvarBanco(banco);
  return banco;
}

function salvarBanco(banco: BancoDeNotas): void {
  fazerBackup();
  writeFileSync(caminhoDados(), JSON.stringify(banco, null, 2), 'utf-8');
}

export function lerTodasAsNotas(): Nota[] {
  return lerBanco().notas;
}

export function buscarNotas(consulta: string): Nota[] {
  const termo = normalizar(consulta.trim());
  const todas = lerTodasAsNotas();
  if (!termo) return todas;
  return todas.filter((n) => normalizar(n.titulo).includes(termo) || normalizar(n.conteudo).includes(termo));
}

export function adicionarNota(nova: NovaNota): Nota {
  const banco = lerBanco();
  const agora = new Date().toISOString();
  const nota: Nota = {
    id: randomUUID(),
    titulo: nova.titulo.trim() || 'Sem título',
    conteudo: nova.conteudo ?? '',
    temaId: nova.temaId ?? null,
    links: nova.links ?? [],
    criadoEm: agora,
    atualizadoEm: agora,
  };
  banco.notas.push(nota);
  salvarBanco(banco);
  return nota;
}

export function atualizarNota(id: string, alteracoes: Partial<NovaNota>): Nota | null {
  const banco = lerBanco();
  const indice = banco.notas.findIndex((n) => n.id === id);
  if (indice === -1) return null;
  const atual = banco.notas[indice];
  const atualizada: Nota = {
    ...atual,
    titulo: alteracoes.titulo ?? atual.titulo,
    conteudo: alteracoes.conteudo ?? atual.conteudo,
    temaId: alteracoes.temaId !== undefined ? alteracoes.temaId : atual.temaId,
    links: alteracoes.links ?? atual.links,
    atualizadoEm: new Date().toISOString(),
  };
  banco.notas[indice] = atualizada;
  salvarBanco(banco);
  return atualizada;
}

/**
 * Notas ligadas a uma nota: pra quais ela linka (`paraFora`) e quais linkam
 * pra ela (`paraDentro`) — os dois lados da sintaxe `[[Nome]]`.
 */
export function notasRelacionadas(id: string): { paraFora: Nota[]; paraDentro: Nota[] } {
  return calcularNotasRelacionadas(lerTodasAsNotas(), id);
}

export function removerNota(id: string): boolean {
  const banco = lerBanco();
  const restantes = banco.notas.filter((n) => n.id !== id);
  const removeu = restantes.length !== banco.notas.length;
  if (removeu) {
    // limpa links quebrados que apontavam pra essa nota
    banco.notas = restantes.map((n) => ({ ...n, links: n.links.filter((l) => l !== id) }));
    salvarBanco(banco);
  }
  return removeu;
}

// ------------------------------------------------------------------------
// Temas (pastas hierárquicas: tema raiz → subtema)
// ------------------------------------------------------------------------

export function listarTemas(): Tema[] {
  return lerBanco().temas;
}

export function adicionarTema(novo: NovoTema): Tema {
  const banco = lerBanco();
  const tema: Tema = {
    id: randomUUID(),
    nome: novo.nome.trim() || 'Sem nome',
    temaPaiId: novo.temaPaiId ?? null,
    criadoEm: new Date().toISOString(),
  };
  banco.temas.push(tema);
  salvarBanco(banco);
  return tema;
}

export function renomearTema(id: string, nome: string): Tema | null {
  const banco = lerBanco();
  const indice = banco.temas.findIndex((t) => t.id === id);
  if (indice === -1) return null;
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return banco.temas[indice];
  banco.temas[indice] = { ...banco.temas[indice], nome: nomeLimpo };
  salvarBanco(banco);
  return banco.temas[indice];
}

/**
 * Remove um tema e (em cascata) seus subtemas diretos. As notas que
 * pertenciam a eles não são apagadas — só voltam a ficar "sem tema".
 */
export function removerTema(id: string): boolean {
  const banco = lerBanco();
  const idsParaRemover = new Set([id, ...banco.temas.filter((t) => t.temaPaiId === id).map((t) => t.id)]);
  const restantes = banco.temas.filter((t) => !idsParaRemover.has(t.id));
  const removeu = restantes.length !== banco.temas.length;
  if (removeu) {
    banco.temas = restantes;
    banco.notas = banco.notas.map((n) => (n.temaId && idsParaRemover.has(n.temaId) ? { ...n, temaId: null } : n));
    salvarBanco(banco);
  }
  return removeu;
}

/**
 * Reordena um grupo de temas irmãos (mesmo nível — todos raiz, ou todos
 * filhos do mesmo pai) pra ficar na ordem dos IDs passados. É o que dá
 * suporte ao drag-and-drop da barra lateral: a ordem de exibição é a ordem
 * de `listarTemas()`, que por sua vez segue a ordem do array no JSON.
 */
export function reordenarTemas(idsNaOrdem: string[]): Tema[] {
  const banco = lerBanco();
  const conjunto = new Set(idsNaOrdem);
  const porId = new Map(banco.temas.map((t) => [t.id, t]));
  const indiceInicial = banco.temas.findIndex((t) => conjunto.has(t.id));
  if (indiceInicial === -1) return banco.temas;

  const resto = banco.temas.filter((t) => !conjunto.has(t.id));
  const antes = banco.temas.slice(0, indiceInicial).filter((t) => !conjunto.has(t.id)).length;
  const grupoOrdenado = idsNaOrdem.map((id) => porId.get(id)).filter((t): t is Tema => Boolean(t));

  resto.splice(antes, 0, ...grupoOrdenado);
  banco.temas = resto;
  salvarBanco(banco);
  return banco.temas;
}

/**
 * Acha um tema a partir de um caminho tipo "Projetos/Hub Pessoal", sem criar
 * nada. Usado pra filtrar (buscar/listar por tema) — ao contrário de
 * `resolverCaminhoDeTema`, um caminho que não existe retorna `null`.
 */
export function acharTemaPorCaminho(caminho: string): Tema | null {
  const partes = caminho
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 0) return null;

  const temas = lerBanco().temas;
  let temaPaiId: string | null = null;
  let atual: Tema | undefined;

  for (const parte of partes) {
    atual = temas.find((t) => t.temaPaiId === temaPaiId && normalizar(t.nome) === normalizar(parte));
    if (!atual) return null;
    temaPaiId = atual.id;
  }

  return atual ?? null;
}

/**
 * Acha (ou cria) um tema a partir de um caminho tipo "Projetos/Hub Pessoal".
 * Usado pelo servidor MCP, que só conhece nomes, nunca IDs.
 */
export function resolverCaminhoDeTema(caminho: string): string | null {
  const partes = caminho
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 0) return null;

  const banco = lerBanco();
  let temaPaiId: string | null = null;
  let temaAtual: Tema | undefined;
  let mudou = false;

  for (const parte of partes) {
    temaAtual = banco.temas.find((t) => t.temaPaiId === temaPaiId && normalizar(t.nome) === normalizar(parte));
    if (!temaAtual) {
      temaAtual = { id: randomUUID(), nome: parte, temaPaiId, criadoEm: new Date().toISOString() };
      banco.temas.push(temaAtual);
      mudou = true;
    }
    temaPaiId = temaAtual.id;
  }

  if (mudou) salvarBanco(banco);
  return temaAtual?.id ?? null;
}
