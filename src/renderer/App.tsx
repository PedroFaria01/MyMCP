import { useEffect, useMemo, useState } from 'react';
import PainelTemas from './components/PainelTemas';
import GradeDeTemas from './components/GradeDeTemas';
import GradeDeNotas from './components/GradeDeNotas';
import CaptureBar from './components/CaptureBar';
import NotaDetalhe from './components/NotaDetalhe';
import type { Nota, NovaNota, Tema } from '../shared/tipos';
import { deduzirTitulo, extrairTitulosLinkados, limparSintaxeDeLink } from './utils/links';
import { SEM_TEMA, caminhoDoTema, listaAchatada, notasDoTema } from '../shared/temas';
import { normalizar } from '../shared/texto';

export default function App() {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [temas, setTemas] = useState<Tema[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [notaSelecionadaId, setNotaSelecionadaId] = useState<string | null>(null);
  const [temaSelecionadoId, setTemaSelecionadoId] = useState<string | null>(null);
  const [consultaBusca, setConsultaBusca] = useState('');
  const [modoSelecao, setModoSelecao] = useState(false);
  const [notasSelecionadas, setNotasSelecionadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([window.hub.listarNotas(), window.hub.listarTemas()])
      .then(([notasCarregadas, temasCarregados]) => {
        setNotas(notasCarregadas);
        setTemas(temasCarregados);
      })
      .finally(() => setCarregando(false));
  }, []);

  const notasFiltradas = useMemo(() => {
    const termo = normalizar(consultaBusca.trim());
    if (!termo) return notas;
    return notas.filter((n) => normalizar(n.titulo).includes(termo) || normalizar(n.conteudo).includes(termo));
  }, [notas, consultaBusca]);

  const notaSelecionada = notas.find((n) => n.id === notaSelecionadaId) ?? null;
  const temaSelecionado =
    temaSelecionadoId && temaSelecionadoId !== SEM_TEMA ? temas.find((t) => t.id === temaSelecionadoId) ?? null : null;

  const emBusca = consultaBusca.trim().length > 0;
  const mostrarVisaoGeral = !emBusca && temaSelecionadoId === null;

  let notasParaExibir: Nota[];
  let tituloArea: string;

  if (emBusca) {
    notasParaExibir = notasFiltradas;
    tituloArea = `Resultados para "${consultaBusca}"`;
  } else if (temaSelecionadoId === SEM_TEMA) {
    notasParaExibir = notas.filter((n) => !n.temaId);
    tituloArea = 'Sem tema';
  } else if (temaSelecionado) {
    notasParaExibir = notasDoTema(notas, temas, temaSelecionado.id);
    tituloArea = caminhoDoTema(temas, temaSelecionado.id);
  } else {
    notasParaExibir = [];
    tituloArea = 'Visão geral';
  }

  const temasRaiz = temas.filter((t) => t.temaPaiId === null).length;

  const estadoVazio = emBusca
    ? { titulo: 'Nada encontrado', texto: `Nenhuma nota corresponde a "${consultaBusca}".` }
    : notas.length === 0
      ? {
          titulo: 'O teu Hub está vazio',
          comIcone: true,
          texto: (
            <>
              Escreve algo na barra abaixo pra criar a tua primeira nota.
              <br />
              Usa <code>[[Nome]]</code> pra linkar outra nota automaticamente.
            </>
          ),
        }
      : {
          titulo: 'Nenhuma nota aqui ainda',
          texto: `Escreve algo na barra abaixo pra criar a primeira nota em "${tituloArea}".`,
        };

  // qualquer [[Nome]] que ainda não existe vira uma nota nova (estilo Obsidian) —
  // usado tanto na barra de captura (nota nova) quanto ao editar uma nota existente
  async function resolverIdsDeLinks(titulos: string[]): Promise<string[]> {
    let notasConhecidas = notas;
    const ids: string[] = [];

    for (const titulo of titulos) {
      const existente = notasConhecidas.find((n) => n.titulo.toLowerCase() === titulo.toLowerCase());
      if (existente) {
        ids.push(existente.id);
      } else {
        const criada = await window.hub.adicionarNota({ titulo, conteudo: '', temaId: null });
        notasConhecidas = [...notasConhecidas, criada];
        ids.push(criada.id);
      }
    }

    if (notasConhecidas !== notas) setNotas(notasConhecidas);
    return ids;
  }

  async function lidarComCaptura(textoDigitado: string) {
    const temaContexto = temaSelecionadoId && temaSelecionadoId !== SEM_TEMA ? temaSelecionadoId : null;
    const idsDosLinks = await resolverIdsDeLinks(extrairTitulosLinkados(textoDigitado));

    const nova = await window.hub.adicionarNota({
      titulo: deduzirTitulo(textoDigitado),
      conteudo: limparSintaxeDeLink(textoDigitado),
      temaId: temaContexto,
      links: idsDosLinks,
    });

    setNotas((atual) => [...atual, nova]);
    setNotaSelecionadaId(nova.id);
  }

  async function lidarComAtualizacao(id: string, alteracoes: Partial<NovaNota>) {
    const atualizada = await window.hub.atualizarNota(id, alteracoes);
    if (!atualizada) return;
    setNotas((atual) => atual.map((n) => (n.id === id ? atualizada : n)));
  }

  async function lidarComRemocao(id: string) {
    await window.hub.removerNota(id);
    setNotas((atual) => atual.filter((n) => n.id !== id).map((n) => ({ ...n, links: n.links.filter((l) => l !== id) })));
    setNotaSelecionadaId((atual) => (atual === id ? null : atual));
  }

  async function lidarComAdicaoDeTema(nome: string, temaPaiId: string | null) {
    const tema = await window.hub.adicionarTema({ nome, temaPaiId });
    setTemas((atual) => [...atual, tema]);
  }

  async function lidarComRenomeacaoDeTema(id: string, nome: string) {
    const atualizado = await window.hub.renomearTema(id, nome);
    if (!atualizado) return;
    setTemas((atual) => atual.map((t) => (t.id === id ? atualizado : t)));
  }

  async function lidarComRemocaoDeTema(id: string) {
    await window.hub.removerTema(id);
    const idsRemovidos = new Set([id, ...temas.filter((t) => t.temaPaiId === id).map((t) => t.id)]);
    setTemas((atual) => atual.filter((t) => !idsRemovidos.has(t.id)));
    setNotas((atual) => atual.map((n) => (n.temaId && idsRemovidos.has(n.temaId) ? { ...n, temaId: null } : n)));
    setTemaSelecionadoId((atual) => (atual && idsRemovidos.has(atual) ? null : atual));
  }

  async function lidarComReordenacaoDeTemas(idsNaOrdem: string[]) {
    const reordenados = await window.hub.reordenarTemas(idsNaOrdem);
    setTemas(reordenados);
  }

  function lidarComAbrirLink(url: string) {
    window.hub.abrirLink(url);
  }

  function lidarComAlternarSelecao(id: string) {
    setNotasSelecionadas((atual) => {
      const novo = new Set(atual);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  async function lidarComMovimentacaoEmLote(temaId: string | null) {
    const ids = [...notasSelecionadas];
    const atualizadas = await Promise.all(ids.map((id) => window.hub.atualizarNota(id, { temaId })));
    setNotas((atual) =>
      atual.map((n) => atualizadas.find((a) => a && a.id === n.id) ?? n),
    );
    setNotasSelecionadas(new Set());
    setModoSelecao(false);
  }

  // sai do modo de seleção sempre que o contexto exibido muda, pra não
  // deixar notas "selecionadas" de um tema anterior invisíveis mas ainda ativas
  useEffect(() => {
    setModoSelecao(false);
    setNotasSelecionadas(new Set());
  }, [temaSelecionadoId, consultaBusca]);

  // atalhos globais: Ctrl/Cmd+K foca a busca, Ctrl/Cmd+N foca a captura,
  // Esc fecha o painel de detalhe (mas não enquanto se está a escrever nele)
  useEffect(() => {
    function lidarComTeclado(evento: KeyboardEvent) {
      const alvo = evento.target as HTMLElement | null;
      const emCampoDeTexto = alvo?.tagName === 'INPUT' || alvo?.tagName === 'TEXTAREA' || alvo?.tagName === 'SELECT';

      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        document.getElementById('hub-busca')?.focus();
        return;
      }
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'n') {
        evento.preventDefault();
        document.getElementById('hub-captura')?.focus();
        return;
      }
      if (evento.key === 'Escape' && !emCampoDeTexto && notaSelecionadaId) {
        setNotaSelecionadaId(null);
      }
    }

    window.addEventListener('keydown', lidarComTeclado);
    return () => window.removeEventListener('keydown', lidarComTeclado);
  }, [notaSelecionadaId]);

  if (carregando) {
    return <div className="app app--carregando">A carregar o teu Hub…</div>;
  }

  return (
    <div className="app">
      <PainelTemas
        temas={temas}
        notas={notas}
        temaSelecionadoId={temaSelecionadoId}
        aoSelecionarTema={setTemaSelecionadoId}
        consulta={consultaBusca}
        aoMudarConsulta={setConsultaBusca}
        aoAdicionarTema={lidarComAdicaoDeTema}
        aoRenomearTema={lidarComRenomeacaoDeTema}
        aoRemoverTema={lidarComRemocaoDeTema}
        aoReordenarTemas={lidarComReordenacaoDeTemas}
      />

      <main className="area-principal">
        <header className="area-principal__cabecalho">
          <div className="area-principal__cabecalho-topo">
            <div>
              <h1 className="area-principal__titulo">{tituloArea}</h1>
              <p className="area-principal__subtitulo">
                {mostrarVisaoGeral
                  ? `${temasRaiz} ${temasRaiz === 1 ? 'tema' : 'temas'}`
                  : `${notasParaExibir.length} ${notasParaExibir.length === 1 ? 'nota' : 'notas'}`}
              </p>
            </div>

            {!mostrarVisaoGeral && notasParaExibir.length > 0 && (
              <button
                className="botao-selecao"
                onClick={() => {
                  setModoSelecao((atual) => !atual);
                  setNotasSelecionadas(new Set());
                }}
              >
                {modoSelecao ? 'Cancelar' : 'Selecionar'}
              </button>
            )}
          </div>

          {modoSelecao && notasSelecionadas.size > 0 && (
            <div className="barra-selecao campo-neumorfico">
              <span className="barra-selecao__contagem">
                {notasSelecionadas.size} {notasSelecionadas.size === 1 ? 'selecionada' : 'selecionadas'}
              </span>
              <select
                className="barra-selecao__select"
                value=""
                aria-label="Mover notas selecionadas para um tema"
                onChange={(evento) => {
                  const valor = evento.target.value;
                  if (!valor) return;
                  lidarComMovimentacaoEmLote(valor === SEM_TEMA ? null : valor);
                }}
              >
                <option value="" disabled>
                  Mover para…
                </option>
                <option value={SEM_TEMA}>Sem tema</option>
                {listaAchatada(temas).map(({ tema, profundidade }) => (
                  <option key={tema.id} value={tema.id}>
                    {profundidade > 0 ? `— ${tema.nome}` : tema.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>

        <div className="area-principal__conteudo">
          {mostrarVisaoGeral ? (
            <GradeDeTemas temas={temas} notas={notas} aoSelecionarTema={setTemaSelecionadoId} />
          ) : (
            <GradeDeNotas
              notas={notasParaExibir}
              temas={temas}
              notaSelecionadaId={notaSelecionadaId}
              aoSelecionarNota={setNotaSelecionadaId}
              estadoVazio={estadoVazio}
              modoSelecao={modoSelecao}
              notasSelecionadas={notasSelecionadas}
              aoAlternarSelecao={lidarComAlternarSelecao}
            />
          )}
        </div>

        <CaptureBar
          aoCapturar={lidarComCaptura}
          rotuloContexto={temaSelecionado ? caminhoDoTema(temas, temaSelecionado.id) : undefined}
        />
      </main>

      {notaSelecionada && (
        <NotaDetalhe
          nota={notaSelecionada}
          notas={notas}
          temas={temas}
          aoFechar={() => setNotaSelecionadaId(null)}
          aoAtualizar={lidarComAtualizacao}
          aoRemover={lidarComRemocao}
          aoSelecionarNota={setNotaSelecionadaId}
          aoResolverLinks={resolverIdsDeLinks}
          aoAbrirLink={lidarComAbrirLink}
        />
      )}
    </div>
  );
}
