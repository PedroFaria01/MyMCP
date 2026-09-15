// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, createEvent } from '@testing-library/react';
import NotaDetalhe from './NotaDetalhe';
import type { Nota, Tema } from '../../shared/tipos';

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

function propsBase(nota: Nota, notas: Nota[] = [nota], temas: Tema[] = []) {
  return {
    nota,
    notas,
    temas,
    aoFechar: vi.fn(),
    aoAtualizar: vi.fn(),
    aoRemover: vi.fn(),
    aoSelecionarNota: vi.fn(),
    aoResolverLinks: vi.fn(async () => [] as string[]),
    aoAbrirLink: vi.fn(),
  };
}

describe('NotaDetalhe', () => {
  it('mostra o conteúdo em modo de visualização e entra em edição ao clicar', () => {
    const nota = criarNota({ id: '1', titulo: 'Minha nota', conteudo: 'Conteúdo aqui' });
    render(<NotaDetalhe {...propsBase(nota)} />);

    expect(screen.getByText('Conteúdo aqui')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Escreve o conteúdo da nota/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Conteúdo aqui'));

    expect(screen.getByPlaceholderText(/Escreve o conteúdo da nota/)).toBeInTheDocument();
  });

  it('renderiza um trecho linkado como botão clicável, que navega sem entrar em edição', () => {
    const alvo = criarNota({ id: '2', titulo: 'Hub Pessoal' });
    const nota = criarNota({ id: '1', titulo: 'A', conteudo: 'Fala sobre Hub Pessoal aqui', links: ['2'] });
    const props = propsBase(nota, [nota, alvo]);

    render(<NotaDetalhe {...props} />);

    // "Hub Pessoal" aparece duas vezes (link inline no texto + chip em "Linka
    // para") — aqui testamos especificamente o link dentro do conteúdo
    fireEvent.click(screen.getByText('Hub Pessoal', { selector: '.painel-nota__link' }));

    expect(props.aoSelecionarNota).toHaveBeenCalledWith('2');
    expect(screen.queryByPlaceholderText(/Escreve o conteúdo da nota/)).not.toBeInTheDocument();
  });

  it('renderiza uma URL no conteúdo como link clicável que abre externo, sem entrar em edição', () => {
    const nota = criarNota({
      id: '1',
      titulo: 'A',
      conteudo: 'Repositório: https://github.com/PedroFaria01/cv-builder aqui',
    });
    const props = propsBase(nota);

    render(<NotaDetalhe {...props} />);

    const link = screen.getByText('https://github.com/PedroFaria01/cv-builder');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://github.com/PedroFaria01/cv-builder');

    fireEvent.click(link);

    expect(props.aoAbrirLink).toHaveBeenCalledWith('https://github.com/PedroFaria01/cv-builder');
    expect(screen.queryByPlaceholderText(/Escreve o conteúdo da nota/)).not.toBeInTheDocument();
  });

  it('digitar [[Nome]] no conteúdo e sair do campo resolve o link e limpa os colchetes', async () => {
    const alvo = criarNota({ id: '2', titulo: 'Hub Pessoal' });
    const nota = criarNota({ id: '1', titulo: 'A', conteudo: 'texto antigo' });
    const props = propsBase(nota, [nota, alvo]);
    props.aoResolverLinks = vi.fn(async () => ['2']);

    render(<NotaDetalhe {...props} />);

    fireEvent.click(screen.getByText('texto antigo'));
    const campo = screen.getByPlaceholderText(/Escreve o conteúdo da nota/);
    fireEvent.change(campo, { target: { value: 'Fala sobre [[Hub Pessoal]] aqui' } });
    fireEvent.blur(campo);

    await waitFor(() => {
      expect(props.aoAtualizar).toHaveBeenCalledWith('1', {
        titulo: 'A',
        conteudo: 'Fala sobre Hub Pessoal aqui',
        links: ['2'],
      });
    });
    expect(props.aoResolverLinks).toHaveBeenCalledWith(['Hub Pessoal']);
  });

  it('dropdown de adicionar link busca e exclui a própria nota e as já linkadas', () => {
    const jaLinkada = criarNota({ id: '2', titulo: 'Já linkada' });
    const candidata = criarNota({ id: '3', titulo: 'Financas do mês' });
    const nota = criarNota({ id: '1', titulo: 'A', links: ['2'] });
    const props = propsBase(nota, [nota, jaLinkada, candidata]);

    render(<NotaDetalhe {...props} />);

    fireEvent.click(screen.getByLabelText('Adicionar link'));

    // não oferece a própria nota nem a que já está linkada
    expect(screen.queryByText('A', { selector: '.dropdown-link__item' })).not.toBeInTheDocument();
    expect(screen.queryByText('Já linkada', { selector: '.dropdown-link__item' })).not.toBeInTheDocument();
    expect(screen.getByText('Financas do mês')).toBeInTheDocument();

    // busca ignora acento
    fireEvent.change(screen.getByLabelText('Buscar nota pra linkar'), { target: { value: 'financas' } });
    expect(screen.getByText('Financas do mês')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Financas do mês'));

    expect(props.aoAtualizar).toHaveBeenCalledWith('1', { links: ['2', '3'] });
  });

  it('botão de fechar o dropdown previne o mousedown (não deixa o blur do campo reabrir)', () => {
    const nota = criarNota({ id: '1', titulo: 'A' });
    render(<NotaDetalhe {...propsBase(nota)} />);

    fireEvent.click(screen.getByLabelText('Adicionar link'));
    const botaoFechar = screen.getByLabelText('Fechar busca de notas pra linkar');

    // sem isso, clicar no × tiraria o foco do campo de busca primeiro (blur
    // fecha o dropdown) e o click do botão reabriria em seguida
    const eventoMouseDown = createEvent.mouseDown(botaoFechar);
    fireEvent(botaoFechar, eventoMouseDown);
    expect(eventoMouseDown.defaultPrevented).toBe(true);

    fireEvent.click(botaoFechar);

    expect(screen.queryByLabelText('Buscar nota pra linkar')).not.toBeInTheDocument();
  });

  it('mostra "Linka para" e desvincula sem apagar a nota', () => {
    const alvo = criarNota({ id: '2', titulo: 'Outra nota' });
    const nota = criarNota({ id: '1', titulo: 'A', conteudo: '', links: ['2'] });
    const props = propsBase(nota, [nota, alvo]);

    render(<NotaDetalhe {...props} />);

    expect(screen.getByText('Linka para')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Desvincular de Outra nota'));

    expect(props.aoAtualizar).toHaveBeenCalledWith('1', { links: [] });
  });

  it('mostra "Linkado por" quando outra nota linka pra essa', () => {
    const nota = criarNota({ id: '1', titulo: 'A' });
    const outra = criarNota({ id: '2', titulo: 'B', links: ['1'] });
    render(<NotaDetalhe {...propsBase(nota, [nota, outra])} />);

    expect(screen.getByText('Linkado por')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('troca de tema chama aoAtualizar com o novo temaId', () => {
    const nota = criarNota({ id: '1', titulo: 'A' });
    const tema: Tema = { id: 't1', nome: 'Projetos', temaPaiId: null, criadoEm: '2026-01-01T00:00:00.000Z' };
    const props = propsBase(nota, [nota], [tema]);

    render(<NotaDetalhe {...props} />);
    fireEvent.change(screen.getByLabelText('Tema da nota'), { target: { value: 't1' } });

    expect(props.aoAtualizar).toHaveBeenCalledWith('1', { temaId: 't1' });
  });

  it('exclusão exige clicar duas vezes', () => {
    const nota = criarNota({ id: '1', titulo: 'A' });
    const props = propsBase(nota);

    render(<NotaDetalhe {...props} />);

    fireEvent.click(screen.getByText('Excluir nota'));
    expect(props.aoRemover).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Clica de novo pra confirmar'));
    expect(props.aoRemover).toHaveBeenCalledWith('1');
  });
});
