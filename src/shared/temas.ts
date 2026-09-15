// Helpers pra organizar notas em temas/subtemas (pastas hierárquicas de 2 níveis).
// Ficam em shared/ porque tanto o renderer quanto o servidor MCP precisam
// montar a mesma árvore e agregar as mesmas contagens.

import type { Nota, Tema } from './tipos.js';

/** Sentinela de seleção pra "notas sem tema" — não é um ID real de tema. */
export const SEM_TEMA = '__sem-tema__';

export interface RamoDeTema {
  tema: Tema;
  filhos: Tema[];
}

export function montarArvore(temas: Tema[]): RamoDeTema[] {
  return temas
    .filter((t) => t.temaPaiId === null)
    .map((tema) => ({ tema, filhos: temas.filter((t) => t.temaPaiId === tema.id) }));
}

/** Conta notas diretamente associadas a cada tema (sem somar subtemas). */
export function contarNotasPorTema(notas: Nota[]): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const nota of notas) {
    if (!nota.temaId) continue;
    contagem.set(nota.temaId, (contagem.get(nota.temaId) ?? 0) + 1);
  }
  return contagem;
}

/**
 * Notas "de" um tema pra exibição: se for um tema raiz, agrega também as
 * notas dos subtemas dele (visão de "tudo relacionado a esse assunto").
 */
export function notasDoTema(notas: Nota[], temas: Tema[], temaId: string): Nota[] {
  const idsRelevantes = new Set([temaId, ...temas.filter((t) => t.temaPaiId === temaId).map((t) => t.id)]);
  return notas.filter((n) => n.temaId && idsRelevantes.has(n.temaId));
}

/** Caminho legível tipo "Projetos / Hub Pessoal" pra um tema ou subtema. */
export function caminhoDoTema(temas: Tema[], temaId: string): string {
  const porId = new Map(temas.map((t) => [t.id, t]));
  const partes: string[] = [];
  let atual = porId.get(temaId);
  while (atual) {
    partes.unshift(atual.nome);
    atual = atual.temaPaiId ? porId.get(atual.temaPaiId) : undefined;
  }
  return partes.join(' / ');
}

/** Lista temas + subtemas em ordem de exibição (raiz, seguida dos filhos), com profundidade. */
export function listaAchatada(temas: Tema[]): { tema: Tema; profundidade: number }[] {
  const resultado: { tema: Tema; profundidade: number }[] = [];
  for (const raiz of temas.filter((t) => t.temaPaiId === null)) {
    resultado.push({ tema: raiz, profundidade: 0 });
    for (const filho of temas.filter((t) => t.temaPaiId === raiz.id)) {
      resultado.push({ tema: filho, profundidade: 1 });
    }
  }
  return resultado;
}
