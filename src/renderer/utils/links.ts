// Sintaxe de link ao estilo Obsidian: [[Título da outra nota]]

const REGEX_LINK = /\[\[([^\]]+)\]\]/g;

export function extrairTitulosLinkados(texto: string): string[] {
  const titulos = new Set<string>();
  const regex = new RegExp(REGEX_LINK);
  let resultado: RegExpExecArray | null;
  while ((resultado = regex.exec(texto))) {
    const titulo = resultado[1].trim();
    if (titulo) titulos.add(titulo);
  }
  return [...titulos];
}

/** Tira os colchetes [[ ]] mas mantém o texto legível no conteúdo salvo */
export function limparSintaxeDeLink(texto: string): string {
  return texto.replace(REGEX_LINK, '$1');
}

export function deduzirTitulo(texto: string): string {
  const primeiraLinha = limparSintaxeDeLink(texto).split('\n')[0].trim();
  if (!primeiraLinha) return 'Sem título';
  return primeiraLinha.length <= 60 ? primeiraLinha : `${primeiraLinha.slice(0, 59)}…`;
}
