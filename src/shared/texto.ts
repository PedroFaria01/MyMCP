// Normalização de texto pra busca/comparação tolerante a acento — "financas"
// deve achar "Finanças" e vice-versa, sem exigir que o usuário digite igual.

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
