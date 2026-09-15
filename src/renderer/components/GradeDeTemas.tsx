// Visão geral: um cartão por tema (raiz), com a contagem de notas e os
// subtemas como atalhos — é o que aparece quando nenhum tema está selecionado.

import type { Nota, Tema } from '../../shared/tipos';
import { montarArvore } from '../../shared/temas';

interface Props {
  temas: Tema[];
  notas: Nota[];
  aoSelecionarTema: (id: string) => void;
}

const UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

export default function GradeDeTemas({ temas, notas, aoSelecionarTema }: Props) {
  const arvore = montarArvore(temas);

  if (arvore.length === 0) {
    return (
      <div className="estado-vazio">
        <div className="estado-vazio__icone campo-neumorfico" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="estado-vazio__titulo">Nenhum tema criado ainda</p>
        <p className="estado-vazio__texto">
          Usa o botão <code>+ Novo tema</code> na barra lateral pra começar a organizar as tuas notas por assunto.
        </p>
      </div>
    );
  }

  const ramosComTotal = arvore.map(({ tema, filhos }) => {
    const idsRelevantes = new Set([tema.id, ...filhos.map((f) => f.id)]);
    const total = notas.filter((n) => n.temaId && idsRelevantes.has(n.temaId)).length;
    return { tema, filhos, total };
  });

  const notasEstaSemana = notas.filter((n) => new Date(n.atualizadoEm).getTime() >= Date.now() - UMA_SEMANA_MS).length;

  const temaMaisAtivo = ramosComTotal.reduce<{ nome: string; total: number } | null>((melhor, ramo) => {
    if (ramo.total === 0) return melhor;
    if (!melhor || ramo.total > melhor.total) return { nome: ramo.tema.nome, total: ramo.total };
    return melhor;
  }, null);

  const partesDoResumo = [
    notasEstaSemana > 0
      ? `${notasEstaSemana} ${notasEstaSemana === 1 ? 'nota atualizada' : 'notas atualizadas'} essa semana`
      : null,
    temaMaisAtivo ? `tema mais ativo: ${temaMaisAtivo.nome}` : null,
  ].filter((parte): parte is string => Boolean(parte));

  return (
    <>
      {partesDoResumo.length > 0 && <p className="grade-temas__resumo">{partesDoResumo.join(' · ')}</p>}

      <div className="grade-notas">
        {ramosComTotal.map(({ tema, filhos, total }) => (
          <button key={tema.id} className="cartao-tema" onClick={() => aoSelecionarTema(tema.id)}>
            <div className="cartao-tema__cabecalho">
              <span className="cartao-tema__titulo">{tema.nome}</span>
              <span className="cartao-tema__contagem">{total}</span>
            </div>

            <span className="cartao-tema__legenda">
              {total === 0 ? 'Nenhuma nota ainda' : total === 1 ? '1 nota' : `${total} notas`}
            </span>

            {filhos.length > 0 && (
              <div className="cartao-tema__subtemas">
                {filhos.map((filho) => (
                  <span
                    key={filho.id}
                    className="etiqueta"
                    onClick={(evento) => {
                      evento.stopPropagation();
                      aoSelecionarTema(filho.id);
                    }}
                  >
                    {filho.nome}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </>
  );
}
