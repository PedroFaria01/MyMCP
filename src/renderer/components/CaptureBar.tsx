import { useRef, useState } from 'react';

interface Props {
  aoCapturar: (texto: string) => void;
  rotuloContexto?: string;
}

export default function CaptureBar({ aoCapturar, rotuloContexto }: Props) {
  const [texto, setTexto] = useState('');
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  function enviar() {
    const valor = texto.trim();
    if (!valor) return;
    aoCapturar(valor);
    setTexto('');
    areaRef.current?.focus();
  }

  return (
    <div className="barra-captura campo-neumorfico">
      <textarea
        id="hub-captura"
        ref={areaRef}
        rows={1}
        value={texto}
        placeholder={
          rotuloContexto
            ? `Escreve algo em ${rotuloContexto}… use [[Nome]] pra linkar outra nota`
            : 'Escreve algo e pressiona Enter… use [[Nome]] pra linkar outra nota'
        }
        onChange={(evento) => setTexto(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter' && !evento.shiftKey) {
            evento.preventDefault();
            enviar();
          }
        }}
      />
      <button
        className="barra-captura__botao"
        onClick={enviar}
        disabled={!texto.trim()}
        aria-label="Adicionar nota"
        title="Adicionar nota (Enter)"
      >
        ↵
      </button>
    </div>
  );
}
