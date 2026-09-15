// Lógica pura usada pelas ferramentas do servidor MCP — separada de
// index.ts porque esse arquivo conecta o servidor (stdio) assim que é
// importado, o que o torna impossível de testar diretamente.

import { normalizar } from '../src/shared/texto.js';
import { notasDoTema } from '../src/shared/temas.js';
import type { Nota, Tema } from '../src/shared/tipos.js';

export const ERRO_TEMA_NAO_ENCONTRADO = (caminho: string) =>
  `Tema "${caminho}" não encontrado. Use listar_temas pra ver os caminhos disponíveis.`;

export function ordenarPorRecencia(notas: Nota[]): Nota[] {
  return notas.slice().sort((a, b) => new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime());
}

/** Pontua uma nota pra uma consulta: título pesa mais que ocorrências no conteúdo. */
export function pontuarRelevancia(nota: Nota, termo: string): number {
  const t = normalizar(termo.trim());
  if (!t) return 0;
  let pontos = normalizar(nota.titulo).includes(t) ? 5 : 0;
  pontos += normalizar(nota.conteudo).split(t).length - 1;
  return pontos;
}

/** Descreve o impacto de remover um tema, pra mostrar numa prévia antes de confirmar. */
export function descreverImpactoDeRemocao(
  temas: Tema[],
  notas: Nota[],
  tema: Tema,
): { subtemas: string[]; notasAfetadas: number } {
  const idsAfetados = new Set([tema.id, ...temas.filter((t) => t.temaPaiId === tema.id).map((t) => t.id)]);
  const subtemas = temas.filter((t) => idsAfetados.has(t.id) && t.id !== tema.id).map((t) => t.nome);
  const notasAfetadas = notas.filter((n) => n.temaId && idsAfetados.has(n.temaId)).length;
  return { subtemas, notasAfetadas };
}

export function mensagemPreviaRemocaoDeTema(caminho: string, subtemas: string[], notasAfetadas: number): string {
  const parteSubtemas = subtemas.length ? ` e os subtemas ${subtemas.join(', ')}` : '';
  return `Isso vai remover o tema "${caminho}"${parteSubtemas}. ${notasAfetadas} nota(s) vão ficar sem tema (nenhuma é apagada). Chame de novo com confirmar: true pra remover de verdade.`;
}

export function mensagemPreviaRemocaoDeNota(nota: Nota): string {
  return `Isso vai remover a nota "${nota.titulo}" (id ${nota.id}). Chame de novo com confirmar: true pra remover de verdade.`;
}

// ------------------------------------------------------------------------
// 1. Busca semântica (TF-IDF + cosseno local, sem IA/nuvem) — acha notas
// que compartilham vocabulário com a consulta mesmo sem a frase exata,
// ao contrário de buscar_contexto (substring). Não é embeddings de rede
// neural: é estatística de texto local, roda instantânea em milhares de
// notas e não depende de internet nem de modelo baixado.
// ------------------------------------------------------------------------

/** Quebra texto em palavras normalizadas, descartando as muito curtas (artigos, preposições). */
export function tokenizar(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

/** IDF de cada termo num corpus: termos raros (aparecem em poucas notas) pesam mais. */
export function calcularIdf(corpusDeTokens: string[][]): Map<string, number> {
  const totalDocs = corpusDeTokens.length;
  const docsComTermo = new Map<string, number>();
  for (const tokens of corpusDeTokens) {
    for (const termo of new Set(tokens)) {
      docsComTermo.set(termo, (docsComTermo.get(termo) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [termo, docs] of docsComTermo) {
    idf.set(termo, Math.log((totalDocs + 1) / (docs + 1)) + 1);
  }
  return idf;
}

export function vetorTfIdf(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const frequencia = new Map<string, number>();
  for (const t of tokens) frequencia.set(t, (frequencia.get(t) ?? 0) + 1);
  const vetor = new Map<string, number>();
  for (const [termo, freq] of frequencia) {
    vetor.set(termo, freq * (idf.get(termo) ?? 1));
  }
  return vetor;
}

export function similaridadeCosseno(a: Map<string, number>, b: Map<string, number>): number {
  let produtoEscalar = 0;
  for (const [termo, valor] of a) {
    const outro = b.get(termo);
    if (outro) produtoEscalar += valor * outro;
  }
  const normaA = Math.sqrt([...a.values()].reduce((soma, v) => soma + v * v, 0));
  const normaB = Math.sqrt([...b.values()].reduce((soma, v) => soma + v * v, 0));
  if (normaA === 0 || normaB === 0) return 0;
  return produtoEscalar / (normaA * normaB);
}

/** Ranking por similaridade de vocabulário (0 a 1). Só devolve notas com alguma sobreposição de termos. */
export function buscarSemanticamente(notas: Nota[], consulta: string, limite = 10): { nota: Nota; pontuacao: number }[] {
  const corpusTokens = notas.map((n) => tokenizar(`${n.titulo} ${n.conteudo}`));
  const idf = calcularIdf(corpusTokens);
  const vetorConsulta = vetorTfIdf(tokenizar(consulta), idf);

  return notas
    .map((nota, i) => ({ nota, pontuacao: similaridadeCosseno(vetorConsulta, vetorTfIdf(corpusTokens[i], idf)) }))
    .filter((r) => r.pontuacao > 0)
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, limite);
}

// ------------------------------------------------------------------------
// 3. Contexto de projeto — empacota as notas de um tema (+ as ligadas por
// [[Nome]] que ficam fora dele) num bloco de texto pronto pra colar em
// outra sessão/agente, como handoff de contexto entre IAs.
// ------------------------------------------------------------------------

export function montarContextoDeProjeto(caminho: string, notasDoProjeto: Nota[], notasRelacionadasDeFora: Nota[]): string {
  if (notasDoProjeto.length === 0) {
    return `Tema "${caminho}" não tem notas.`;
  }
  const blocoPrincipal = notasDoProjeto.map((n) => `## ${n.titulo}\n${n.conteudo || '(sem conteúdo)'}`).join('\n\n');
  const blocoRelacionadas = notasRelacionadasDeFora.length
    ? `\n\n---\n\n## Notas relacionadas (fora de "${caminho}")\n\n` +
      notasRelacionadasDeFora.map((n) => `- **${n.titulo}**: ${n.conteudo || '(sem conteúdo)'}`).join('\n')
    : '';
  return `# Contexto: ${caminho}\n\n${blocoPrincipal}${blocoRelacionadas}`;
}

// ------------------------------------------------------------------------
// 4. Pendências — extrai itens tipo "- [ ] algo" ou "TODO: algo" do
// conteúdo das notas. Itens já marcados "- [x]" não contam (ficaram feitos).
// ------------------------------------------------------------------------

export function extrairPendencias(conteudo: string): string[] {
  const achados: string[] = [];
  for (const linha of conteudo.split('\n')) {
    const checkbox = linha.match(/^\s*-?\s*\[ \]\s*(.+)/);
    if (checkbox) {
      achados.push(checkbox[1].trim());
      continue;
    }
    const todo = linha.match(/\bTODO:?\s+(.+)/i);
    if (todo) achados.push(todo[1].trim());
  }
  return achados;
}

// ------------------------------------------------------------------------
// 5. Sugestão de organização — aponta notas sem tema, temas quase vazios
// e pares de temas com nome parecido (possíveis duplicatas por digitação).
// ------------------------------------------------------------------------

export function notasSemTema(notas: Nota[]): Nota[] {
  return notas.filter((n) => !n.temaId);
}

export function temasQuaseVazios(temas: Tema[], notas: Nota[], limiar = 1): { tema: Tema; total: number }[] {
  return temas
    .map((tema) => ({ tema, total: notasDoTema(notas, temas, tema.id).length }))
    .filter((r) => r.total <= limiar);
}

function distanciaLevenshtein(a: string, b: string): number {
  const linhas: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) linhas[i][0] = i;
  for (let j = 0; j <= b.length; j++) linhas[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      linhas[i][j] = Math.min(linhas[i - 1][j] + 1, linhas[i][j - 1] + 1, linhas[i - 1][j - 1] + custo);
    }
  }
  return linhas[a.length][b.length];
}

/** Pares de temas com nome quase igual (nomes com 4+ letras, distância de edição <= 2). */
export function temasParecidos(temas: Tema[], limiarDistancia = 2): [Tema, Tema][] {
  const pares: [Tema, Tema][] = [];
  for (let i = 0; i < temas.length; i++) {
    for (let j = i + 1; j < temas.length; j++) {
      const nomeA = normalizar(temas[i].nome);
      const nomeB = normalizar(temas[j].nome);
      if (Math.min(nomeA.length, nomeB.length) < 4) continue;
      if (distanciaLevenshtein(nomeA, nomeB) <= limiarDistancia) {
        pares.push([temas[i], temas[j]]);
      }
    }
  }
  return pares;
}
