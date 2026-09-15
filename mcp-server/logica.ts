// Lógica pura usada pelas ferramentas do servidor MCP — separada de
// index.ts porque esse arquivo conecta o servidor (stdio) assim que é
// importado, o que o torna impossível de testar diretamente.

import { normalizar } from '../src/shared/texto.js';
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
