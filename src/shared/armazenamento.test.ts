// Testa a camada de armazenamento numa pasta temporária isolada — nunca no
// data/notas.json real. `HUB_PASTA_DADOS` é lido em cada chamada (não como
// const de módulo), então basta apontar a env var antes de cada teste pra
// garantir isolamento total do arquivo de dados do usuário.

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as A from './armazenamento.js';

let pastaTemp: string;

beforeEach(() => {
  pastaTemp = mkdtempSync(join(tmpdir(), 'hub-pessoal-teste-'));
  process.env.HUB_PASTA_DADOS = pastaTemp;
});

afterEach(() => {
  delete process.env.HUB_PASTA_DADOS;
  rmSync(pastaTemp, { recursive: true, force: true });
});

describe('notas', () => {
  it('cria e lista notas', () => {
    A.adicionarNota({ titulo: 'Primeira', conteudo: 'abc' });
    A.adicionarNota({ titulo: 'Segunda', conteudo: 'def' });
    expect(A.lerTodasAsNotas().map((n) => n.titulo)).toEqual(['Primeira', 'Segunda']);
  });

  it('usa "Sem título" quando o título vem vazio', () => {
    const nota = A.adicionarNota({ titulo: '   ', conteudo: '' });
    expect(nota.titulo).toBe('Sem título');
  });

  it('atualiza só os campos passados', () => {
    const nota = A.adicionarNota({ titulo: 'Original', conteudo: 'x' });
    const atualizada = A.atualizarNota(nota.id, { conteudo: 'y' });
    expect(atualizada?.titulo).toBe('Original');
    expect(atualizada?.conteudo).toBe('y');
  });

  it('permite limpar o tema explicitamente com temaId: null', () => {
    const tema = A.adicionarTema({ nome: 'Financas' });
    const nota = A.adicionarNota({ titulo: 'Gasto', conteudo: '', temaId: tema.id });
    const semTema = A.atualizarNota(nota.id, { temaId: null });
    expect(semTema?.temaId).toBeNull();
  });

  it('retorna null ao atualizar nota inexistente', () => {
    expect(A.atualizarNota('id-que-nao-existe', { titulo: 'x' })).toBeNull();
  });

  it('remove nota e limpa links quebrados que apontavam pra ela', () => {
    const a = A.adicionarNota({ titulo: 'A', conteudo: '' });
    const b = A.adicionarNota({ titulo: 'B', conteudo: '', links: [a.id] });
    A.removerNota(a.id);
    const bAtualizada = A.lerTodasAsNotas().find((n) => n.id === b.id);
    expect(bAtualizada?.links).toEqual([]);
  });

  it('notasRelacionadas mostra os dois lados do link', () => {
    const a = A.adicionarNota({ titulo: 'A', conteudo: '' });
    const b = A.adicionarNota({ titulo: 'B', conteudo: '', links: [a.id] });
    expect(A.notasRelacionadas(b.id).paraFora.map((n) => n.id)).toEqual([a.id]);
    expect(A.notasRelacionadas(a.id).paraDentro.map((n) => n.id)).toEqual([b.id]);
  });

  it('busca ignora acento e caixa', () => {
    A.adicionarNota({ titulo: 'Finanças do mês', conteudo: '' });
    expect(A.buscarNotas('financas').length).toBe(1);
    expect(A.buscarNotas('FINANÇAS').length).toBe(1);
  });
});

describe('temas', () => {
  it('cria tema raiz e subtema', () => {
    const raiz = A.adicionarTema({ nome: 'Projetos' });
    const filho = A.adicionarTema({ nome: 'Hub Pessoal', temaPaiId: raiz.id });
    expect(filho.temaPaiId).toBe(raiz.id);
  });

  it('renomeia um tema existente', () => {
    const tema = A.adicionarTema({ nome: 'Antigo' });
    const renomeado = A.renomearTema(tema.id, 'Novo');
    expect(renomeado?.nome).toBe('Novo');
  });

  it('remover tema raiz remove os subtemas e desvincula as notas (sem apagá-las)', () => {
    const raiz = A.adicionarTema({ nome: 'Projetos' });
    const filho = A.adicionarTema({ nome: 'Hub Pessoal', temaPaiId: raiz.id });
    const nota = A.adicionarNota({ titulo: 'Nota', conteudo: '', temaId: filho.id });

    A.removerTema(raiz.id);

    expect(A.listarTemas().find((t) => t.id === filho.id)).toBeUndefined();
    const notaDepois = A.lerTodasAsNotas().find((n) => n.id === nota.id);
    expect(notaDepois).toBeDefined();
    expect(notaDepois?.temaId).toBeNull();
  });

  it('acharTemaPorCaminho encontra por caminho ignorando acento, sem criar', () => {
    const raiz = A.adicionarTema({ nome: 'Financas' });
    A.adicionarTema({ nome: 'Cartão', temaPaiId: raiz.id });

    expect(A.acharTemaPorCaminho('Finanças/Cartao')?.nome).toBe('Cartão');
    expect(A.acharTemaPorCaminho('Nao Existe')).toBeNull();
    expect(A.listarTemas()).toHaveLength(2); // não criou nada
  });

  it('resolverCaminhoDeTema cria a cadeia inteira quando não existe', () => {
    const id = A.resolverCaminhoDeTema('Projetos/Hub Pessoal');
    expect(id).not.toBeNull();
    expect(A.listarTemas()).toHaveLength(2);

    // chamar de novo com o mesmo caminho não duplica
    const idDeNovo = A.resolverCaminhoDeTema('Projetos/Hub Pessoal');
    expect(idDeNovo).toBe(id);
    expect(A.listarTemas()).toHaveLength(2);
  });

  it('reordenarTemas reordena um grupo de irmãos sem afetar os demais', () => {
    const a = A.adicionarTema({ nome: 'A' });
    const b = A.adicionarTema({ nome: 'B' });
    const c = A.adicionarTema({ nome: 'C' });

    A.reordenarTemas([c.id, a.id, b.id]);

    expect(A.listarTemas().map((t) => t.nome)).toEqual(['C', 'A', 'B']);
  });

  it('reordenarTemas só reordena dentro do grupo de irmãos passado (não mistura níveis)', () => {
    const raiz = A.adicionarTema({ nome: 'Projetos' });
    const f1 = A.adicionarTema({ nome: 'Um', temaPaiId: raiz.id });
    const f2 = A.adicionarTema({ nome: 'Dois', temaPaiId: raiz.id });

    A.reordenarTemas([f2.id, f1.id]);

    const nomes = A.listarTemas()
      .filter((t) => t.temaPaiId === raiz.id)
      .map((t) => t.nome);
    expect(nomes).toEqual(['Dois', 'Um']);
    // o pai continua sendo o primeiro tema criado, intacto
    expect(A.listarTemas()[0].nome).toBe('Projetos');
  });
});

describe('migração do formato antigo (tags -> temas)', () => {
  it('migra notas com tags pra temas de raiz, preservando as que já têm temaId', () => {
    mkdirSync(pastaTemp, { recursive: true });
    const bancoAntigo = {
      notas: [
        { id: '1', titulo: 'Nota com tag', conteudo: '', tags: ['financas'], links: [], criadoEm: 'x', atualizadoEm: 'x' },
        { id: '2', titulo: 'Nota sem tag', conteudo: '', tags: [], links: [], criadoEm: 'x', atualizadoEm: 'x' },
      ],
    };
    writeFileSync(join(pastaTemp, 'notas.json'), JSON.stringify(bancoAntigo), 'utf-8');

    const notas = A.lerTodasAsNotas();
    const temas = A.listarTemas();

    expect(temas.map((t) => t.nome)).toEqual(['financas']);
    const notaComTag = notas.find((n) => n.id === '1');
    expect(notaComTag?.temaId).toBe(temas[0].id);
    const notaSemTag = notas.find((n) => n.id === '2');
    expect(notaSemTag?.temaId).toBeNull();
  });
});

describe('backup automático', () => {
  it('cria um backup a cada escrita e mantém só os 5 mais recentes', () => {
    for (let i = 0; i < 7; i++) {
      A.adicionarNota({ titulo: `Nota ${i}`, conteudo: '' });
    }
    const pastaBackups = join(pastaTemp, 'backups');
    const arquivos = readdirSync(pastaBackups);
    expect(arquivos.length).toBeLessThanOrEqual(5);
    expect(arquivos.length).toBeGreaterThan(0);
  });
});
