// Navegação principal do Hub: uma árvore de temas (e subtemas) de até 2
// níveis, ao estilo "pastas". Selecionar um tema filtra as notas relacionadas
// na área principal — substitui a antiga lista plana de notas.

import { useRef, useState } from 'react';
import type { Nota, Tema } from '../../shared/tipos';
import { SEM_TEMA, contarNotasPorTema, montarArvore } from '../../shared/temas';

interface Props {
  temas: Tema[];
  notas: Nota[];
  temaSelecionadoId: string | null;
  aoSelecionarTema: (id: string | null) => void;
  consulta: string;
  aoMudarConsulta: (valor: string) => void;
  aoAdicionarTema: (nome: string, temaPaiId: string | null) => void;
  aoRenomearTema: (id: string, nome: string) => void;
  aoRemoverTema: (id: string) => void;
  aoReordenarTemas: (idsNaOrdem: string[]) => void;
}

interface ArrastoAtivo {
  id: string;
  /** Grupo de irmãos que pode receber esse item — raiz, ou filhos de um mesmo pai */
  paiId: string | null;
}

interface AlvoDeSolta {
  id: string;
  posicao: 'antes' | 'depois';
}

export default function PainelTemas({
  temas,
  notas,
  temaSelecionadoId,
  aoSelecionarTema,
  consulta,
  aoMudarConsulta,
  aoAdicionarTema,
  aoRenomearTema,
  aoRemoverTema,
  aoReordenarTemas,
}: Props) {
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const [arrastando, setArrastando] = useState<ArrastoAtivo | null>(null);
  const [alvoDrop, setAlvoDrop] = useState<AlvoDeSolta | null>(null);
  // espelham o state em refs pra os handlers de drag lerem o valor mais
  // recente na hora — o dragover que acontece logo após o dragstart pode
  // disparar antes do React re-renderizar com o setArrastando do início
  const arrastandoRef = useRef<ArrastoAtivo | null>(null);
  const alvoDropRef = useRef<AlvoDeSolta | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState('');
  const [novoRaizAberto, setNovoRaizAberto] = useState(false);
  const [textoNovoRaiz, setTextoNovoRaiz] = useState('');
  const [novoSubtemaDe, setNovoSubtemaDe] = useState<string | null>(null);
  const [textoNovoSubtema, setTextoNovoSubtema] = useState('');
  const [confirmandoRemocaoId, setConfirmandoRemocaoId] = useState<string | null>(null);

  const canceladoRef = useRef(false);
  const tempoConfirmacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arvore = montarArvore(temas);
  const contagemDireta = contarNotasPorTema(notas);
  const contagemSemTema = notas.filter((n) => !n.temaId).length;

  function alternarColapso(id: string) {
    setColapsados((atual) => {
      const novo = new Set(atual);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  function iniciarEdicao(tema: Tema) {
    canceladoRef.current = false;
    setEditandoId(tema.id);
    setTextoEdicao(tema.nome);
  }

  function confirmarEdicao(id: string) {
    setEditandoId(null);
    if (canceladoRef.current) return;
    const nome = textoEdicao.trim();
    if (nome) aoRenomearTema(id, nome);
  }

  function abrirNovoRaiz() {
    canceladoRef.current = false;
    setTextoNovoRaiz('');
    setNovoRaizAberto(true);
  }

  function confirmarNovoRaiz() {
    setNovoRaizAberto(false);
    if (canceladoRef.current) return;
    const nome = textoNovoRaiz.trim();
    if (nome) aoAdicionarTema(nome, null);
  }

  function abrirNovoSubtema(paiId: string) {
    canceladoRef.current = false;
    setTextoNovoSubtema('');
    setNovoSubtemaDe(paiId);
    setColapsados((atual) => {
      const novo = new Set(atual);
      novo.delete(paiId);
      return novo;
    });
  }

  function confirmarNovoSubtema() {
    const paiId = novoSubtemaDe;
    setNovoSubtemaDe(null);
    if (canceladoRef.current || !paiId) return;
    const nome = textoNovoSubtema.trim();
    if (nome) aoAdicionarTema(nome, paiId);
  }

  // o próprio ícone é o elemento arrastável (não a linha inteira) — assim o
  // navegador não precisa "adivinhar" que o gesto começado em cima do botão
  // de título é pra linha ancestral, o que no Electron se mostrou instável
  function lidarComArrastoInicio(evento: React.DragEvent<HTMLSpanElement>, id: string, paiId: string | null) {
    evento.dataTransfer.effectAllowed = 'move';
    // alguns navegadores exigem dados no dataTransfer pra aceitar o drag
    evento.dataTransfer.setData('text/plain', id);
    // mostra a linha inteira arrastando, não só o ícone de 12px
    const linha = evento.currentTarget.closest('.linha-tema');
    if (linha instanceof HTMLElement) evento.dataTransfer.setDragImage(linha, 16, 16);
    const ativo = { id, paiId };
    arrastandoRef.current = ativo;
    setArrastando(ativo);
  }

  function lidarComArrastoSobre(evento: React.DragEvent, id: string, paiId: string | null) {
    const atual = arrastandoRef.current;
    if (!atual || atual.paiId !== paiId || atual.id === id) return;
    evento.preventDefault();
    const retangulo = evento.currentTarget.getBoundingClientRect();
    const meio = retangulo.top + retangulo.height / 2;
    const alvo: AlvoDeSolta = { id, posicao: evento.clientY < meio ? 'antes' : 'depois' };
    alvoDropRef.current = alvo;
    setAlvoDrop(alvo);
  }

  function lidarComSolta(evento: React.DragEvent, idsDoGrupo: string[]) {
    evento.preventDefault();
    const atual = arrastandoRef.current;
    const alvo = alvoDropRef.current;
    if (!atual || !alvo) return;
    const semArrastando = idsDoGrupo.filter((id) => id !== atual.id);
    const indiceAlvo = semArrastando.indexOf(alvo.id);
    const deslocamento = alvo.posicao === 'antes' ? 0 : 1;
    const novaOrdem = [...semArrastando];
    novaOrdem.splice(indiceAlvo + deslocamento, 0, atual.id);
    aoReordenarTemas(novaOrdem);
    lidarComArrastoFim();
  }

  function lidarComArrastoFim() {
    arrastandoRef.current = null;
    alvoDropRef.current = null;
    setArrastando(null);
    setAlvoDrop(null);
  }

  function classesDeArrasto(id: string): string {
    let classes = '';
    if (arrastando?.id === id) classes += ' linha-tema--arrastando';
    if (alvoDrop?.id === id) classes += ` linha-tema--alvo-${alvoDrop.posicao}`;
    return classes;
  }

  function pedirConfirmacaoDeRemocao(id: string) {
    if (confirmandoRemocaoId === id) {
      if (tempoConfirmacao.current) clearTimeout(tempoConfirmacao.current);
      setConfirmandoRemocaoId(null);
      aoRemoverTema(id);
      return;
    }
    setConfirmandoRemocaoId(id);
    if (tempoConfirmacao.current) clearTimeout(tempoConfirmacao.current);
    tempoConfirmacao.current = setTimeout(() => setConfirmandoRemocaoId(null), 3000);
  }

  return (
    <aside className="barra-lateral">
      <div className="barra-lateral__cabecalho">
        <span className="barra-lateral__logo">Hub Pessoal</span>
        <span className="barra-lateral__contador">
          {notas.length} {notas.length === 1 ? 'nota' : 'notas'}
        </span>
      </div>

      <div className="campo-neumorfico campo-neumorfico--busca">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          id="hub-busca"
          type="text"
          value={consulta}
          onChange={(evento) => aoMudarConsulta(evento.target.value)}
          placeholder="Buscar notas… (Ctrl+K)"
          aria-label="Buscar notas"
        />
      </div>

      <nav className="barra-lateral__lista">
        <button
          className={'linha-tema linha-tema--especial' + (temaSelecionadoId === null ? ' linha-tema--selecionada' : '')}
          onClick={() => aoSelecionarTema(null)}
        >
          <span className="linha-tema__chevron linha-tema__chevron--vazio" />
          <span className="linha-tema__titulo">Visão geral</span>
        </button>

        {arvore.length === 0 && !novoRaizAberto && (
          <p className="barra-lateral__vazio">Cria o teu primeiro tema pra organizar as notas por assunto.</p>
        )}

        {arvore.map(({ tema, filhos }) => {
          const colapsado = colapsados.has(tema.id);
          const total = filhos.reduce(
            (soma, filho) => soma + (contagemDireta.get(filho.id) ?? 0),
            contagemDireta.get(tema.id) ?? 0,
          );

          return (
            <div key={tema.id} className="grupo-tema">
              <div
                className={
                  'linha-tema' +
                  (tema.id === temaSelecionadoId ? ' linha-tema--selecionada' : '') +
                  classesDeArrasto(tema.id)
                }
                onDragOver={(evento) => lidarComArrastoSobre(evento, tema.id, null)}
                onDrop={(evento) =>
                  lidarComSolta(
                    evento,
                    arvore.map((ramo) => ramo.tema.id),
                  )
                }
              >
                <span
                  className="linha-tema__alca"
                  title="Arrastar pra reordenar"
                  aria-hidden="true"
                  draggable={editandoId !== tema.id}
                  onDragStart={(evento) => lidarComArrastoInicio(evento, tema.id, null)}
                  onDragEnd={lidarComArrastoFim}
                >
                  ⠿
                </span>

                {filhos.length > 0 ? (
                  <button
                    className={'linha-tema__chevron' + (colapsado ? '' : ' linha-tema__chevron--aberto')}
                    onClick={() => alternarColapso(tema.id)}
                    aria-label={colapsado ? 'Expandir tema' : 'Recolher tema'}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M9 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : (
                  <span className="linha-tema__chevron linha-tema__chevron--vazio" />
                )}

                {editandoId === tema.id ? (
                  <input
                    className="linha-tema__input"
                    autoFocus
                    value={textoEdicao}
                    onChange={(evento) => setTextoEdicao(evento.target.value)}
                    onBlur={() => confirmarEdicao(tema.id)}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter') evento.currentTarget.blur();
                      if (evento.key === 'Escape') {
                        canceladoRef.current = true;
                        evento.currentTarget.blur();
                      }
                    }}
                  />
                ) : (
                  <button
                    className="linha-tema__titulo"
                    onClick={() => aoSelecionarTema(tema.id)}
                    onDoubleClick={() => iniciarEdicao(tema)}
                    title={tema.nome}
                  >
                    {tema.nome}
                  </button>
                )}

                <span className="linha-tema__contagem">{total}</span>
                <span className="linha-tema__acoes">
                  <button className="linha-tema__acao" title="Adicionar subtema" onClick={() => abrirNovoSubtema(tema.id)}>
                    +
                  </button>
                  <button className="linha-tema__acao" title="Renomear tema" onClick={() => iniciarEdicao(tema)}>
                    ✎
                  </button>
                  <button
                    className={
                      'linha-tema__acao linha-tema__acao--perigo' +
                      (confirmandoRemocaoId === tema.id ? ' linha-tema__acao--confirmar' : '')
                    }
                    title={confirmandoRemocaoId === tema.id ? 'Clica de novo pra confirmar' : 'Remover tema'}
                    onClick={() => pedirConfirmacaoDeRemocao(tema.id)}
                  >
                    ×
                  </button>
                </span>
              </div>

              {!colapsado && (filhos.length > 0 || novoSubtemaDe === tema.id) && (
                <div className="grupo-tema__filhos">
                  {filhos.map((filho) => (
                    <div
                      key={filho.id}
                      className={
                        'linha-tema linha-tema--subtema' +
                        (filho.id === temaSelecionadoId ? ' linha-tema--selecionada' : '') +
                        classesDeArrasto(filho.id)
                      }
                      onDragOver={(evento) => lidarComArrastoSobre(evento, filho.id, tema.id)}
                      onDrop={(evento) => lidarComSolta(evento, filhos.map((f) => f.id))}
                    >
                      <span
                        className="linha-tema__alca"
                        title="Arrastar pra reordenar"
                        aria-hidden="true"
                        draggable={editandoId !== filho.id}
                        onDragStart={(evento) => lidarComArrastoInicio(evento, filho.id, tema.id)}
                        onDragEnd={lidarComArrastoFim}
                      >
                        ⠿
                      </span>
                      <span className="linha-tema__chevron linha-tema__chevron--vazio" />

                      {editandoId === filho.id ? (
                        <input
                          className="linha-tema__input"
                          autoFocus
                          value={textoEdicao}
                          onChange={(evento) => setTextoEdicao(evento.target.value)}
                          onBlur={() => confirmarEdicao(filho.id)}
                          onKeyDown={(evento) => {
                            if (evento.key === 'Enter') evento.currentTarget.blur();
                            if (evento.key === 'Escape') {
                              canceladoRef.current = true;
                              evento.currentTarget.blur();
                            }
                          }}
                        />
                      ) : (
                        <button
                          className="linha-tema__titulo"
                          onClick={() => aoSelecionarTema(filho.id)}
                          onDoubleClick={() => iniciarEdicao(filho)}
                          title={filho.nome}
                        >
                          {filho.nome}
                        </button>
                      )}

                      <span className="linha-tema__contagem">{contagemDireta.get(filho.id) ?? 0}</span>
                      <span className="linha-tema__acoes">
                        <button className="linha-tema__acao" title="Renomear subtema" onClick={() => iniciarEdicao(filho)}>
                          ✎
                        </button>
                        <button
                          className={
                            'linha-tema__acao linha-tema__acao--perigo' +
                            (confirmandoRemocaoId === filho.id ? ' linha-tema__acao--confirmar' : '')
                          }
                          title={confirmandoRemocaoId === filho.id ? 'Clica de novo pra confirmar' : 'Remover subtema'}
                          onClick={() => pedirConfirmacaoDeRemocao(filho.id)}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  ))}

                  {novoSubtemaDe === tema.id && (
                    <input
                      className="linha-tema__input linha-tema__input--novo"
                      autoFocus
                      value={textoNovoSubtema}
                      placeholder="Nome do subtema…"
                      onChange={(evento) => setTextoNovoSubtema(evento.target.value)}
                      onBlur={confirmarNovoSubtema}
                      onKeyDown={(evento) => {
                        if (evento.key === 'Enter') evento.currentTarget.blur();
                        if (evento.key === 'Escape') {
                          canceladoRef.current = true;
                          evento.currentTarget.blur();
                        }
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {contagemSemTema > 0 && (
          <button
            className={
              'linha-tema linha-tema--especial' + (temaSelecionadoId === SEM_TEMA ? ' linha-tema--selecionada' : '')
            }
            onClick={() => aoSelecionarTema(SEM_TEMA)}
          >
            <span className="linha-tema__chevron linha-tema__chevron--vazio" />
            <span className="linha-tema__titulo">Sem tema</span>
            <span className="linha-tema__contagem">{contagemSemTema}</span>
          </button>
        )}

        {novoRaizAberto ? (
          <input
            className="linha-tema__input linha-tema__input--novo"
            autoFocus
            value={textoNovoRaiz}
            placeholder="Nome do tema…"
            onChange={(evento) => setTextoNovoRaiz(evento.target.value)}
            onBlur={confirmarNovoRaiz}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') evento.currentTarget.blur();
              if (evento.key === 'Escape') {
                canceladoRef.current = true;
                evento.currentTarget.blur();
              }
            }}
          />
        ) : (
          <button className="botao-novo-tema" onClick={abrirNovoRaiz}>
            + Novo tema
          </button>
        )}
      </nav>
    </aside>
  );
}
