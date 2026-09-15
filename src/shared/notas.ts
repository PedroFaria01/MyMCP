// Helpers puros sobre arrays de notas já carregados em memória — sem tocar
// em disco. Servem tanto pro servidor (que os alimenta com `lerTodasAsNotas()`)
// quanto pro renderer (que já tem todas as notas no state, sem precisar de
// mais uma viagem de IPC só pra calcular algo derivado).

import type { Nota } from './tipos.js';

/** Notas ligadas a uma nota: pra quais ela linka (`paraFora`) e quais linkam pra ela (`paraDentro`). */
export function notasRelacionadas(notas: Nota[], id: string): { paraFora: Nota[]; paraDentro: Nota[] } {
  const nota = notas.find((n) => n.id === id);
  if (!nota) return { paraFora: [], paraDentro: [] };
  const paraFora = notas.filter((n) => nota.links.includes(n.id));
  const paraDentro = notas.filter((n) => n.id !== id && n.links.includes(id));
  return { paraFora, paraDentro };
}

export interface SegmentoDeConteudo {
  texto: string;
  /** Presente quando esse trecho é o título de uma nota linkada — vira link clicável na exibição */
  notaId?: string;
}

/**
 * Quebra o conteúdo salvo em segmentos, marcando os trechos que batem com o
 * título de uma nota linkada. O texto já foi salvo sem os colchetes `[[ ]]`
 * (removidos na captura), então a única forma de saber o que virou link é
 * reencontrar o título de cada nota referenciada em `links` dentro do texto.
 */
export function destacarLinks(conteudo: string, notasLinkadas: Pick<Nota, 'id' | 'titulo'>[]): SegmentoDeConteudo[] {
  const candidatos = notasLinkadas
    .filter((n) => n.titulo.trim().length > 0)
    .sort((a, b) => b.titulo.length - a.titulo.length);

  if (candidatos.length === 0 || !conteudo) return [{ texto: conteudo }];

  const conteudoEmMinusculas = conteudo.toLowerCase();
  const segmentos: SegmentoDeConteudo[] = [];
  let cursor = 0;

  while (cursor < conteudo.length) {
    let melhorIndice = -1;
    let melhorCandidato: Pick<Nota, 'id' | 'titulo'> | null = null;

    for (const candidato of candidatos) {
      const indice = conteudoEmMinusculas.indexOf(candidato.titulo.toLowerCase(), cursor);
      if (indice !== -1 && (melhorIndice === -1 || indice < melhorIndice)) {
        melhorIndice = indice;
        melhorCandidato = candidato;
      }
    }

    if (melhorIndice === -1 || !melhorCandidato) {
      segmentos.push({ texto: conteudo.slice(cursor) });
      break;
    }

    if (melhorIndice > cursor) {
      segmentos.push({ texto: conteudo.slice(cursor, melhorIndice) });
    }
    const fim = melhorIndice + melhorCandidato.titulo.length;
    segmentos.push({ texto: conteudo.slice(melhorIndice, fim), notaId: melhorCandidato.id });
    cursor = fim;
  }

  return segmentos;
}
