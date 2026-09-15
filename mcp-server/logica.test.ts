import { describe, expect, it } from 'vitest';
import {
  descreverImpactoDeRemocao,
  mensagemPreviaRemocaoDeNota,
  mensagemPreviaRemocaoDeTema,
  ordenarPorRecencia,
  pontuarRelevancia,
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
