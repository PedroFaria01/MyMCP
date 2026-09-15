// Substitui o antigo grafo canvas: mostra as notas como cartões numa grelha,
// que é mais legível e mais fácil de escanear do que nós flutuando num plano.

import type { ReactNode } from 'react';
import type { Nota, Tema } from '../../shared/tipos';
import { formatarDataRelativa } from '../utils/data';
import { caminhoDoTema } from '../../shared/temas';

interface Props {
  notas: Nota[];
  temas: Tema[];
  notaSelecionadaId: string | null;
  aoSelecionarNota: (id: string) => void;
  /** O que mostrar quando `notas` está vazio — o contexto (busca, tema, hub inteiro) é decidido por quem chama. */
  estadoVazio: { titulo: string; texto: ReactNode; comIcone?: boolean };
  /** Modo de seleção múltipla (pra mover várias notas de tema de uma vez) */
  modoSelecao?: boolean;
  notasSelecionadas?: Set<string>;
  aoAlternarSelecao?: (id: string) => void;
}

function trecho(texto: string, tamanho: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (!limpo) return '';
  return limpo.length > tamanho ? `${limpo.slice(0, tamanho - 1)}…` : limpo;
}

export default function GradeDeNotas({
  notas,
  temas,
  notaSelecionadaId,
  aoSelecionarNota,
  estadoVazio,
  modoSelecao = false,
  notasSelecionadas,
  aoAlternarSelecao,
}: Props) {
  if (notas.length === 0) {
    return (
      <div className="estado-vazio">
        {estadoVazio.comIcone && (
          <div className="estado-vazio__icone campo-neumorfico" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
        )}
        <p className="estado-vazio__titulo">{estadoVazio.titulo}</p>
        <p className="estado-vazio__texto">{estadoVazio.texto}</p>
      </div>
    );
  }

  return (
    <div className="grade-notas">
      {notas.map((nota) => {
        const selecionada = notasSelecionadas?.has(nota.id) ?? false;
        return (
          <button
            key={nota.id}
            className={
              'cartao-nota-grande' +
              (nota.id === notaSelecionadaId ? ' cartao-nota-grande--selecionado' : '') +
              (modoSelecao && selecionada ? ' cartao-nota-grande--marcado' : '')
            }
            onClick={() => (modoSelecao ? aoAlternarSelecao?.(nota.id) : aoSelecionarNota(nota.id))}
          >
            {modoSelecao && (
              <span
                className={'cartao-nota-grande__checkbox' + (selecionada ? ' cartao-nota-grande__checkbox--marcado' : '')}
                aria-hidden="true"
              >
                {selecionada && '✓'}
              </span>
            )}

            <div className="cartao-nota-grande__cabecalho">
              <span className="cartao-nota-grande__titulo">{nota.titulo}</span>
              {nota.links.length > 0 && (
                <span className="cartao-nota-grande__links" title={`${nota.links.length} nota(s) linkada(s)`}>
                  {nota.links.length}
                </span>
              )}
            </div>

            {nota.conteudo && <p className="cartao-nota-grande__trecho">{trecho(nota.conteudo, 140)}</p>}

            <div className="cartao-nota-grande__rodape">
              {nota.temaId ? (
                <span className="etiqueta etiqueta--tema">{caminhoDoTema(temas, nota.temaId)}</span>
              ) : (
                <span />
              )}
              <span className="cartao-nota-grande__data">{formatarDataRelativa(nota.atualizadoEm)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
