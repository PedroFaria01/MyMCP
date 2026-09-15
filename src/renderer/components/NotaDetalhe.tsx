import { useEffect, useMemo, useRef, useState } from 'react';
import type { Nota, NovaNota, Tema } from '../../shared/tipos';
import { listaAchatada } from '../../shared/temas';
import { destacarLinks, destacarUrls, notasRelacionadas } from '../../shared/notas';
import { normalizar } from '../../shared/texto';
import { extrairTitulosLinkados, limparSintaxeDeLink } from '../utils/links';

interface Props {
  nota: Nota;
  notas: Nota[];
  temas: Tema[];
  aoFechar: () => void;
  aoAtualizar: (id: string, alteracoes: Partial<NovaNota>) => void;
  aoRemover: (id: string) => void;
  aoSelecionarNota: (id: string) => void;
  /** Acha (ou cria) as notas referenciadas por [[Nome]] e devolve os IDs — igual à barra de captura */
  aoResolverLinks: (titulos: string[]) => Promise<string[]>;
  /** Abre uma URL http/https no navegador padrão do SO */
  aoAbrirLink: (url: string) => void;
}

export default function NotaDetalhe({
  nota,
  notas,
  temas,
  aoFechar,
  aoAtualizar,
  aoRemover,
  aoSelecionarNota,
  aoResolverLinks,
  aoAbrirLink,
}: Props) {
  const [titulo, setTitulo] = useState(nota.titulo);
  const [conteudo, setConteudo] = useState(nota.conteudo);
  const [editandoConteudo, setEditandoConteudo] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [adicionandoLink, setAdicionandoLink] = useState(false);
  const [buscaLink, setBuscaLink] = useState('');
  const tempoConfirmacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  // sincroniza o formulário quando o usuário troca de nota selecionada
  useEffect(() => {
    setTitulo(nota.titulo);
    setConteudo(nota.conteudo);
    setEditandoConteudo(false);
    setConfirmandoExclusao(false);
    setAdicionandoLink(false);
  }, [nota.id]);

  useEffect(() => () => {
    if (tempoConfirmacao.current) clearTimeout(tempoConfirmacao.current);
  }, []);

  const { paraFora, paraDentro } = useMemo(() => notasRelacionadas(notas, nota.id), [notas, nota.id]);

  const segmentos = useMemo(() => destacarLinks(conteudo, paraFora), [conteudo, paraFora]);

  const candidatosParaLinkar = useMemo(() => {
    const idsJaLinkados = new Set(nota.links);
    const termo = normalizar(buscaLink.trim());
    return notas
      .filter((n) => n.id !== nota.id && !idsJaLinkados.has(n.id))
      .filter((n) => !termo || normalizar(n.titulo).includes(termo))
      .slice(0, 50);
  }, [notas, nota.id, nota.links, buscaLink]);

  function abrirOuFecharAdicaoDeLink() {
    setBuscaLink('');
    setAdicionandoLink((atual) => !atual);
  }

  function adicionarLink(idAlvo: string) {
    aoAtualizar(nota.id, { links: [...nota.links, idAlvo] });
    setBuscaLink('');
  }

  async function salvarSeMudou() {
    if (titulo === nota.titulo && conteudo === nota.conteudo) return;

    // [[Nome]] digitado agora também vira link de verdade, igual na captura
    const titulosLinkados = extrairTitulosLinkados(conteudo);
    let conteudoFinal = conteudo;
    let linksFinais = nota.links;

    if (titulosLinkados.length > 0) {
      const idsNovos = await aoResolverLinks(titulosLinkados);
      linksFinais = [...new Set([...nota.links, ...idsNovos])];
      conteudoFinal = limparSintaxeDeLink(conteudo);
      setConteudo(conteudoFinal);
    }

    aoAtualizar(nota.id, { titulo: titulo.trim() || 'Sem título', conteudo: conteudoFinal, links: linksFinais });
  }

  async function fecharEdicaoDeConteudo() {
    await salvarSeMudou();
    setEditandoConteudo(false);
  }

  function lidarComExclusao() {
    if (!confirmandoExclusao) {
      setConfirmandoExclusao(true);
      tempoConfirmacao.current = setTimeout(() => setConfirmandoExclusao(false), 3000);
      return;
    }
    aoRemover(nota.id);
  }

  return (
    <aside className="painel-nota">
      <div className="painel-nota__cabecalho">
        <button className="botao-icone" onClick={aoFechar} aria-label="Fechar" title="Fechar">
          ×
        </button>
      </div>

      <input
        className="painel-nota__titulo"
        value={titulo}
        onChange={(evento) => setTitulo(evento.target.value)}
        onBlur={salvarSeMudou}
      />

      <div className="painel-nota__tema campo-neumorfico">
        <select
          value={nota.temaId ?? ''}
          onChange={(evento) => aoAtualizar(nota.id, { temaId: evento.target.value || null })}
          aria-label="Tema da nota"
        >
          <option value="">Sem tema</option>
          {listaAchatada(temas).map(({ tema, profundidade }) => (
            <option key={tema.id} value={tema.id}>
              {profundidade > 0 ? `— ${tema.nome}` : tema.nome}
            </option>
          ))}
        </select>
      </div>

      {editandoConteudo ? (
        <textarea
          className="painel-nota__conteudo campo-neumorfico"
          autoFocus
          value={conteudo}
          onChange={(evento) => setConteudo(evento.target.value)}
          onBlur={fecharEdicaoDeConteudo}
          placeholder="Escreve o conteúdo da nota… use [[Nome]] pra linkar outra nota"
        />
      ) : (
        <div
          className="painel-nota__conteudo campo-neumorfico painel-nota__conteudo--vista"
          onClick={() => setEditandoConteudo(true)}
          role="textbox"
          tabIndex={0}
          aria-label="Conteúdo da nota"
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') setEditandoConteudo(true);
          }}
        >
          {conteudo ? (
            segmentos.map((segmento, indice) =>
              segmento.notaId ? (
                <button
                  key={indice}
                  className="painel-nota__link"
                  onClick={(evento) => {
                    evento.stopPropagation();
                    aoSelecionarNota(segmento.notaId!);
                  }}
                >
                  {segmento.texto}
                </button>
              ) : (
                destacarUrls(segmento.texto).map((trecho, subIndice) =>
                  trecho.url ? (
                    <a
                      key={`${indice}-${subIndice}`}
                      className="painel-nota__link"
                      href={trecho.url}
                      onClick={(evento) => {
                        evento.preventDefault();
                        evento.stopPropagation();
                        aoAbrirLink(trecho.url!);
                      }}
                    >
                      {trecho.texto}
                    </a>
                  ) : (
                    <span key={`${indice}-${subIndice}`}>{trecho.texto}</span>
                  ),
                )
              ),
            )
          ) : (
            <span className="painel-nota__conteudo-vazio">Escreve o conteúdo da nota…</span>
          )}
        </div>
      )}

      <div className="painel-nota__relacionadas">
        <div className="painel-nota__relacionadas-grupo">
          <div className="painel-nota__relacionadas-cabecalho">
            <span className="painel-nota__relacionadas-titulo">Linka para</span>
            <button
              className="painel-nota__botao-adicionar-link"
              // sem isso, clicar no × tira o foco do campo de busca (blur
              // fecha o dropdown) e só DEPOIS o click chega e alterna de
              // novo — abre e fecha no mesmo clique. preventDefault no
              // mousedown mantém o foco onde estava, então só o clique conta
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={abrirOuFecharAdicaoDeLink}
              aria-label={adicionandoLink ? 'Fechar busca de notas pra linkar' : 'Adicionar link'}
              title="Adicionar link"
            >
              {adicionandoLink ? '×' : '+'}
            </button>
          </div>

          {adicionandoLink && (
            <div
              className="dropdown-link campo-neumorfico"
              onBlur={(evento) => {
                if (!evento.currentTarget.contains(evento.relatedTarget as Node)) {
                  setAdicionandoLink(false);
                }
              }}
            >
              <input
                autoFocus
                type="text"
                value={buscaLink}
                onChange={(evento) => setBuscaLink(evento.target.value)}
                placeholder="Buscar nota pra linkar…"
                aria-label="Buscar nota pra linkar"
                onKeyDown={(evento) => {
                  if (evento.key === 'Escape') setAdicionandoLink(false);
                }}
              />
              <div className="dropdown-link__lista">
                {candidatosParaLinkar.length === 0 ? (
                  <p className="dropdown-link__vazio">
                    {notas.length <= 1 ? 'Não há outras notas ainda.' : 'Nenhuma nota encontrada.'}
                  </p>
                ) : (
                  candidatosParaLinkar.map((candidata) => (
                    <button
                      key={candidata.id}
                      className="dropdown-link__item"
                      onMouseDown={(evento) => evento.preventDefault()}
                      onClick={() => adicionarLink(candidata.id)}
                    >
                      {candidata.titulo}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {paraFora.length > 0 && (
            <div className="painel-nota__relacionadas-lista">
              {paraFora.map((relacionada) => (
                <span key={relacionada.id} className="etiqueta etiqueta--link etiqueta--removivel">
                  <button className="etiqueta--link__nome" onClick={() => aoSelecionarNota(relacionada.id)}>
                    {relacionada.titulo}
                  </button>
                  <button
                    className="etiqueta--link__remover"
                    title="Desvincular (não apaga a nota)"
                    aria-label={`Desvincular de ${relacionada.titulo}`}
                    onClick={() => aoAtualizar(nota.id, { links: nota.links.filter((id) => id !== relacionada.id) })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {paraDentro.length > 0 && (
          <div className="painel-nota__relacionadas-grupo">
            <span className="painel-nota__relacionadas-titulo">Linkado por</span>
            <div className="painel-nota__relacionadas-lista">
              {paraDentro.map((relacionada) => (
                <button
                  key={relacionada.id}
                  className="etiqueta etiqueta--link"
                  onClick={() => aoSelecionarNota(relacionada.id)}
                >
                  {relacionada.titulo}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="painel-nota__meta">
        Atualizada em {new Date(nota.atualizadoEm).toLocaleString('pt-PT')}
      </div>

      <button
        className={'botao-perigo' + (confirmandoExclusao ? ' botao-perigo--confirmar' : '')}
        onClick={lidarComExclusao}
      >
        {confirmandoExclusao ? 'Clica de novo pra confirmar' : 'Excluir nota'}
      </button>
    </aside>
  );
}
