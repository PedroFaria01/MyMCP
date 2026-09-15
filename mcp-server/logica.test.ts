import { describe, expect, it } from 'vitest';
import {
  descreverImpactoDeRemocao,
  mensagemPreviaRemocaoDeNota,
  mensagemPreviaRemocaoDeTema,
  ordenarPorRecencia,
  pontuarRelevancia,
  buscarSemanticamente,
  montarContextoDeProjeto,
  extrairPendencias,
  notasSemTema,
  temasQuaseVazios,
  temasParecidos,
} from './logica.js';
import type { Nota, Tema } from '../src/shared/tipos.js';

function criarNota(parcial: Partial<Nota> & Pick<Nota, 'id' | 'titulo'>): Nota {
  return {
    conteudo: '',
    temaId: null,
    links: [],
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...parcial,
  };
}

function criarTema(parcial: Partial<Tema> & Pick<Tema, 'id' | 'nome'>): Tema {
  return { temaPaiId: null, criadoEm: '2026-01-01T00:00:00.000Z', ...parcial };
}

describe('pontuarRelevancia', () => {
  it('dá mais peso pra ocorrência no título do que no conteúdo', () => {
    const noTitulo = criarNota({ id: '1', titulo: 'Financas do mês', conteudo: '' });
    const noConteudo = criarNota({ id: '2', titulo: 'Outra coisa', conteudo: 'falei de financas aqui' });
    expect(pontuarRelevancia(noTitulo, 'financas')).toBeGreaterThan(pontuarRelevancia(noConteudo, 'financas'));
  });

  it('ignora acento', () => {
    const nota = criarNota({ id: '1', titulo: 'Finanças', conteudo: '' });
    expect(pontuarRelevancia(nota, 'financas')).toBeGreaterThan(0);
  });

  it('consulta vazia pontua zero', () => {
    const nota = criarNota({ id: '1', titulo: 'Qualquer', conteudo: '' });
    expect(pontuarRelevancia(nota, '  ')).toBe(0);
  });
});

describe('ordenarPorRecencia', () => {
  it('coloca a mais recente primeiro, sem mutar o array original', () => {
    const antiga = criarNota({ id: 'a', titulo: 'A', atualizadoEm: '2026-01-01T00:00:00.000Z' });
    const recente = criarNota({ id: 'b', titulo: 'B', atualizadoEm: '2026-06-01T00:00:00.000Z' });
    const original = [antiga, recente];

    const ordenadas = ordenarPorRecencia(original);

    expect(ordenadas.map((n) => n.id)).toEqual(['b', 'a']);
    expect(original.map((n) => n.id)).toEqual(['a', 'b']); // não mutou o array passado
  });
});

describe('descreverImpactoDeRemocao', () => {
  it('lista os subtemas diretos e soma as notas afetadas (tema + subtemas)', () => {
    const raiz = criarTema({ id: 'raiz', nome: 'Projetos' });
    const filho = criarTema({ id: 'filho', nome: 'Hub Pessoal', temaPaiId: 'raiz' });
    const temas = [raiz, filho];
    const notas = [
      criarNota({ id: '1', titulo: 'A', temaId: 'raiz' }),
      criarNota({ id: '2', titulo: 'B', temaId: 'filho' }),
      criarNota({ id: '3', titulo: 'C', temaId: null }),
    ];

    const impacto = descreverImpactoDeRemocao(temas, notas, raiz);

    expect(impacto.subtemas).toEqual(['Hub Pessoal']);
    expect(impacto.notasAfetadas).toBe(2);
  });

  it('tema folha (sem subtemas) só conta as notas dele mesmo', () => {
    const folha = criarTema({ id: 'folha', nome: 'Financas' });
    const notas = [criarNota({ id: '1', titulo: 'A', temaId: 'folha' })];

    const impacto = descreverImpactoDeRemocao([folha], notas, folha);

    expect(impacto.subtemas).toEqual([]);
    expect(impacto.notasAfetadas).toBe(1);
  });
});

describe('mensagens de prévia de remoção', () => {
  it('mensagem de tema menciona subtemas só quando existem', () => {
    expect(mensagemPreviaRemocaoDeTema('Projetos', [], 0)).not.toContain('subtemas');
    expect(mensagemPreviaRemocaoDeTema('Projetos', ['Hub Pessoal'], 3)).toContain('subtemas Hub Pessoal');
    expect(mensagemPreviaRemocaoDeTema('Projetos', [], 0)).toContain('confirmar: true');
  });

  it('mensagem de nota inclui título e id, e pede confirmação', () => {
    const nota = criarNota({ id: 'abc', titulo: 'Minha nota' });
    const msg = mensagemPreviaRemocaoDeNota(nota);
    expect(msg).toContain('Minha nota');
    expect(msg).toContain('abc');
    expect(msg).toContain('confirmar: true');
  });
});

describe('buscarSemanticamente', () => {
  it('acha nota que compartilha vocabulário raro com a consulta, mesmo sem a frase exata', () => {
    const alvo = criarNota({ id: '1', titulo: 'Manutenção do carro', conteudo: 'troquei a embreagem na oficina' });
    const distante = criarNota({ id: '2', titulo: 'Lista de compras', conteudo: 'leite, pão, ovos' });
    const resultado = buscarSemanticamente([alvo, distante], 'embreagem oficina carro');
    expect(resultado[0]?.nota.id).toBe('1');
    expect(resultado.find((r) => r.nota.id === '2')).toBeUndefined();
  });

  it('consulta sem termos em comum não devolve nada', () => {
    const nota = criarNota({ id: '1', titulo: 'Financas', conteudo: 'cartão de crédito' });
    expect(buscarSemanticamente([nota], 'astronomia')).toEqual([]);
  });

  it('respeita o limite', () => {
    const notas = Array.from({ length: 5 }, (_, i) => criarNota({ id: String(i), titulo: 'projeto teste', conteudo: '' }));
    expect(buscarSemanticamente(notas, 'projeto teste', 2)).toHaveLength(2);
  });
});

describe('montarContextoDeProjeto', () => {
  it('avisa quando o tema não tem notas', () => {
    expect(montarContextoDeProjeto('Projetos/X', [], [])).toContain('não tem notas');
  });

  it('junta as notas do projeto e lista as relacionadas de fora à parte', () => {
    const principal = criarNota({ id: '1', titulo: 'Nota A', conteudo: 'conteúdo A' });
    const externa = criarNota({ id: '2', titulo: 'Nota B', conteudo: 'conteúdo B' });
    const texto = montarContextoDeProjeto('Projetos/X', [principal], [externa]);
    expect(texto).toContain('Nota A');
    expect(texto).toContain('conteúdo A');
    expect(texto).toContain('Notas relacionadas');
    expect(texto).toContain('Nota B');
  });
});

describe('extrairPendencias', () => {
  it('acha checkbox em aberto e ignora os já marcados', () => {
    const pendencias = extrairPendencias('- [ ] comprar tinta\n- [x] já fiz isso\nnada aqui');
    expect(pendencias).toEqual(['comprar tinta']);
  });

  it('acha TODO em qualquer caixa', () => {
    expect(extrairPendencias('todo: revisar contrato')).toEqual(['revisar contrato']);
    expect(extrairPendencias('TODO: outra coisa')).toEqual(['outra coisa']);
  });

  it('conteúdo sem pendências devolve array vazio', () => {
    expect(extrairPendencias('só um texto qualquer')).toEqual([]);
  });
});

describe('notasSemTema', () => {
  it('filtra só as notas com temaId nulo', () => {
    const comTema = criarNota({ id: '1', titulo: 'A', temaId: 'x' });
    const semTema = criarNota({ id: '2', titulo: 'B', temaId: null });
    expect(notasSemTema([comTema, semTema])).toEqual([semTema]);
  });
});

describe('temasQuaseVazios', () => {
  it('aponta temas com 0 ou 1 nota (limiar padrão) e ignora os com mais', () => {
    const vazio = criarTema({ id: '1', nome: 'Vazio' });
    const comUma = criarTema({ id: '2', nome: 'Uma' });
    const cheio = criarTema({ id: '3', nome: 'Cheio' });
    const notas = [
      criarNota({ id: 'a', titulo: 'A', temaId: '2' }),
      criarNota({ id: 'b', titulo: 'B', temaId: '3' }),
      criarNota({ id: 'c', titulo: 'C', temaId: '3' }),
    ];
    const resultado = temasQuaseVazios([vazio, comUma, cheio], notas);
    expect(resultado.map((r) => r.tema.id).sort()).toEqual(['1', '2']);
  });
});

describe('temasParecidos', () => {
  it('acha par de nomes quase iguais (variação de acento/digitação)', () => {
    const a = criarTema({ id: '1', nome: 'Financas' });
    const b = criarTema({ id: '2', nome: 'Finanças' });
    const c = criarTema({ id: '3', nome: 'Agenda' });
    const pares = temasParecidos([a, b, c]);
    expect(pares).toHaveLength(1);
    expect(pares[0].map((t) => t.id).sort()).toEqual(['1', '2']);
  });

  it('nomes bem diferentes não formam par', () => {
    const a = criarTema({ id: '1', nome: 'Projetos' });
    const b = criarTema({ id: '2', nome: 'Agenda' });
    expect(temasParecidos([a, b])).toEqual([]);
  });
});
