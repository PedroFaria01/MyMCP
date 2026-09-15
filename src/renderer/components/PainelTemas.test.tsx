// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PainelTemas from './PainelTemas';
import type { Nota, Tema } from '../../shared/tipos';

function criarTema(parcial: Partial<Tema> & Pick<Tema, 'id' | 'nome'>): Tema {
  return { temaPaiId: null, criadoEm: '2026-01-01T00:00:00.000Z', ...parcial };
}

function propsBase(temas: Tema[] = [], notas: Nota[] = []) {
  return {
    temas,
    notas,
    temaSelecionadoId: null as string | null,
    aoSelecionarTema: vi.fn(),
    consulta: '',
    aoMudarConsulta: vi.fn(),
    aoAdicionarTema: vi.fn(),
    aoRenomearTema: vi.fn(),
    aoRemoverTema: vi.fn(),
    aoReordenarTemas: vi.fn(),
  };
}

// jsdom não implementa DataTransfer de verdade — um objeto simples com a
// mesma forma basta pro React ler `setData`/`getData` durante os handlers.
function criarDataTransfer() {
  const dados: Record<string, string> = {};
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: (tipo: string, valor: string) => {
      dados[tipo] = valor;
    },
    getData: (tipo: string) => dados[tipo] ?? '',
    setDragImage: () => {},
  } as unknown as DataTransfer;
}

describe('PainelTemas', () => {
  it('lista temas de raiz com contagem de notas', () => {
    const props = propsBase([criarTema({ id: 'a', nome: 'Projetos' })]);
    render(<PainelTemas {...props} />);
    expect(screen.getByText('Projetos')).toBeInTheDocument();
  });

  it('cria um tema raiz ao digitar e pressionar Enter', () => {
    const props = propsBase();
    render(<PainelTemas {...props} />);

    fireEvent.click(screen.getByText('+ Novo tema'));
    const campo = screen.getByPlaceholderText('Nome do tema…');
    fireEvent.change(campo, { target: { value: 'Financas' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    expect(props.aoAdicionarTema).toHaveBeenCalledWith('Financas', null);
  });

  it('Escape cancela a criação de um tema sem chamar aoAdicionarTema', () => {
    const props = propsBase();
    render(<PainelTemas {...props} />);

    fireEvent.click(screen.getByText('+ Novo tema'));
    const campo = screen.getByPlaceholderText('Nome do tema…');
    fireEvent.change(campo, { target: { value: 'Financas' } });
    fireEvent.keyDown(campo, { key: 'Escape' });

    expect(props.aoAdicionarTema).not.toHaveBeenCalled();
  });

  it('clicar num tema seleciona ele', () => {
    const props = propsBase([criarTema({ id: 'a', nome: 'Projetos' })]);
    render(<PainelTemas {...props} />);

    fireEvent.click(screen.getByText('Projetos'));

    expect(props.aoSelecionarTema).toHaveBeenCalledWith('a');
  });

  it('duplo clique entra em edição; Enter confirma o novo nome', () => {
    const props = propsBase([criarTema({ id: 'a', nome: 'Projetos' })]);
    render(<PainelTemas {...props} />);

    fireEvent.doubleClick(screen.getByText('Projetos'));
    const campo = screen.getByDisplayValue('Projetos');
    fireEvent.change(campo, { target: { value: 'Trabalho' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    expect(props.aoRenomearTema).toHaveBeenCalledWith('a', 'Trabalho');
  });

  it('remover exige clicar duas vezes no ×', () => {
    const props = propsBase([criarTema({ id: 'a', nome: 'Projetos' })]);
    render(<PainelTemas {...props} />);

    const botaoRemover = screen.getByTitle('Remover tema');
    fireEvent.click(botaoRemover);
    expect(props.aoRemoverTema).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Clica de novo pra confirmar'));
    expect(props.aoRemoverTema).toHaveBeenCalledWith('a');
  });

  it('subtema aparece indentado sob o pai, com sua própria contagem', () => {
    const props = propsBase(
      [criarTema({ id: 'raiz', nome: 'Projetos' }), criarTema({ id: 'filho', nome: 'Site Pessoal', temaPaiId: 'raiz' })],
      [{ id: 'n1', titulo: 'Nota', conteudo: '', temaId: 'filho', links: [], criadoEm: '', atualizadoEm: '' }],
    );
    render(<PainelTemas {...props} />);

    expect(screen.getByText('Site Pessoal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Site Pessoal'));
    expect(props.aoSelecionarTema).toHaveBeenCalledWith('filho');
  });

  it('arrastar um tema pela alça reordena os irmãos', () => {
    const props = propsBase([criarTema({ id: 'a', nome: 'A' }), criarTema({ id: 'b', nome: 'B' })]);
    render(<PainelTemas {...props} />);

    const alca = screen.getAllByTitle('Arrastar pra reordenar')[0];
    const linhaB = screen.getByText('B').closest('.linha-tema')!;

    fireEvent.dragStart(alca, { dataTransfer: criarDataTransfer() });
    fireEvent.dragOver(linhaB, { dataTransfer: criarDataTransfer(), clientY: 100 });
    fireEvent.drop(linhaB, { dataTransfer: criarDataTransfer() });

    expect(props.aoReordenarTemas).toHaveBeenCalledWith(['b', 'a']);
  });

  it('arrastar não mistura grupos: subtema não reordena com tema de raiz', () => {
    const props = propsBase([
      criarTema({ id: 'raiz1', nome: 'Projetos' }),
      criarTema({ id: 'raiz2', nome: 'Financas' }),
      criarTema({ id: 'filho', nome: 'Site Pessoal', temaPaiId: 'raiz1' }),
    ]);
    render(<PainelTemas {...props} />);

    // ordem de renderização: raiz1, o subtema dele (filho), depois raiz2
    const alcaDoFilho = screen.getAllByTitle('Arrastar pra reordenar')[1];
    const linhaRaiz2 = screen.getByText('Financas').closest('.linha-tema')!;

    fireEvent.dragStart(alcaDoFilho, { dataTransfer: criarDataTransfer() });
    fireEvent.dragOver(linhaRaiz2, { dataTransfer: criarDataTransfer(), clientY: 100 });
    fireEvent.drop(linhaRaiz2, { dataTransfer: criarDataTransfer() });

    expect(props.aoReordenarTemas).not.toHaveBeenCalled();
  });
});
