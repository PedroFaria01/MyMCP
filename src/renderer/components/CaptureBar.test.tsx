// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CaptureBar from './CaptureBar';

describe('CaptureBar', () => {
  it('desabilita o botão quando o campo está vazio', () => {
    render(<CaptureBar aoCapturar={vi.fn()} />);
    expect(screen.getByRole('button', { name: /adicionar nota/i })).toBeDisabled();
  });

  it('envia o texto ao pressionar Enter e limpa o campo', () => {
    const aoCapturar = vi.fn();
    render(<CaptureBar aoCapturar={aoCapturar} />);
    const campo = screen.getByPlaceholderText(/escreve algo/i);

    fireEvent.change(campo, { target: { value: 'Minha nota' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    expect(aoCapturar).toHaveBeenCalledWith('Minha nota');
    expect((campo as HTMLTextAreaElement).value).toBe('');
  });

  it('Shift+Enter não envia — permite nova linha', () => {
    const aoCapturar = vi.fn();
    render(<CaptureBar aoCapturar={aoCapturar} />);
    const campo = screen.getByPlaceholderText(/escreve algo/i);

    fireEvent.change(campo, { target: { value: 'linha 1' } });
    fireEvent.keyDown(campo, { key: 'Enter', shiftKey: true });

    expect(aoCapturar).not.toHaveBeenCalled();
  });

  it('texto só com espaços não habilita o botão nem envia', () => {
    const aoCapturar = vi.fn();
    render(<CaptureBar aoCapturar={aoCapturar} />);
    const campo = screen.getByPlaceholderText(/escreve algo/i);

    fireEvent.change(campo, { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: /adicionar nota/i })).toBeDisabled();
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(aoCapturar).not.toHaveBeenCalled();
  });

  it('mostra placeholder contextual quando rotuloContexto é passado', () => {
    render(<CaptureBar aoCapturar={vi.fn()} rotuloContexto="Projetos" />);
    expect(screen.getByPlaceholderText(/em Projetos/)).toBeInTheDocument();
  });

  it('clicar no botão envia o texto digitado', () => {
    const aoCapturar = vi.fn();
    render(<CaptureBar aoCapturar={aoCapturar} />);
    const campo = screen.getByPlaceholderText(/escreve algo/i);

    fireEvent.change(campo, { target: { value: 'Via botão' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar nota/i }));

    expect(aoCapturar).toHaveBeenCalledWith('Via botão');
  });
});
