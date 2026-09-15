import { describe, expect, it } from 'vitest';
import { destacarLinks, notasRelacionadas } from './notas.js';
import type { Nota } from './tipos.js';

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

describe('notasRelacionadas', () => {
  it('separa os dois lados do link', () => {
    const a = criarNota({ id: 'a', titulo: 'A', links: ['b'] });
    const b = criarNota({ id: 'b', titulo: 'B' });
    const notas = [a, b];

    expect(notasRelacionadas(notas, 'a').paraFora.map((n) => n.id)).toEqual(['b']);
    expect(notasRelacionadas(notas, 'a').paraDentro).toEqual([]);
    expect(notasRelacionadas(notas, 'b').paraDentro.map((n) => n.id)).toEqual(['a']);
  });

  it('retorna vazio pra nota inexistente', () => {
    expect(notasRelacionadas([], 'nao-existe')).toEqual({ paraFora: [], paraDentro: [] });
  });
});

describe('destacarLinks', () => {
  it('marca o trecho que bate com o título de uma nota linkada', () => {
    const segmentos = destacarLinks('Fala sobre Hub Pessoal aqui', [{ id: '1', titulo: 'Hub Pessoal' }]);
    expect(segmentos).toEqual([
      { texto: 'Fala sobre ' },
      { texto: 'Hub Pessoal', notaId: '1' },
      { texto: ' aqui' },
    ]);
  });

  it('sem notas linkadas, devolve o texto inteiro como um único segmento', () => {
    expect(destacarLinks('texto qualquer', [])).toEqual([{ texto: 'texto qualquer' }]);
  });

  it('prefere o título mais longo quando um é substring do outro', () => {
    const segmentos = destacarLinks('Projetos Hub Pessoal', [
      { id: 'curto', titulo: 'Hub' },
      { id: 'longo', titulo: 'Hub Pessoal' },
    ]);
    const marcado = segmentos.find((s) => s.notaId);
    expect(marcado).toEqual({ texto: 'Hub Pessoal', notaId: 'longo' });
  });

  it('ignora caixa ao procurar, mas preserva o texto original na exibição', () => {
    const segmentos = destacarLinks('fala de HUB PESSOAL agora', [{ id: '1', titulo: 'Hub Pessoal' }]);
    expect(segmentos.find((s) => s.notaId)?.texto).toBe('HUB PESSOAL');
  });
});
