// Tipos compartilhados entre o processo principal do Electron,
// o renderer (interface) e o servidor MCP standalone.
// Ficam num só lugar pra garantir que os três falem a mesma "língua".

export interface Nota {
  id: string;
  titulo: string;
  conteudo: string;
  /** Tema ou subtema ao qual esta nota pertence — null significa "sem tema" */
  temaId: string | null;
  /** IDs de outras notas que esta nota referencia — isso é o que vira aresta no grafo */
  links: string[];
  criadoEm: string; // ISO date
  atualizadoEm: string; // ISO date
}

/**
 * Tema (ou subtema, quando temaPaiId aponta pra outro tema) — a forma como
 * as notas são organizadas em pastas hierárquicas na barra lateral.
 * Ex: "Projetos" (raiz) → "Hub Pessoal" (subtema, temaPaiId = id de "Projetos").
 */
export interface Tema {
  id: string;
  nome: string;
  temaPaiId: string | null;
  criadoEm: string; // ISO date
}

export interface BancoDeNotas {
  notas: Nota[];
  temas: Tema[];
}

/** Payload usado para criar uma nota nova (o resto é preenchido automaticamente) */
export interface NovaNota {
  titulo: string;
  conteudo: string;
  temaId?: string | null;
  links?: string[];
}

/** Payload usado para criar um tema ou subtema novo */
export interface NovoTema {
  nome: string;
  temaPaiId?: string | null;
}

/** Formato enxuto que a API exposta ao renderer usa (contextBridge só aceita dados serializáveis) */
export type ApiHub = {
  listarNotas: () => Promise<Nota[]>;
  buscarNotas: (consulta: string) => Promise<Nota[]>;
  adicionarNota: (nota: NovaNota) => Promise<Nota>;
  atualizarNota: (id: string, alteracoes: Partial<NovaNota>) => Promise<Nota | null>;
  removerNota: (id: string) => Promise<boolean>;
  listarTemas: () => Promise<Tema[]>;
  adicionarTema: (tema: NovoTema) => Promise<Tema>;
  renomearTema: (id: string, nome: string) => Promise<Tema | null>;
  removerTema: (id: string) => Promise<boolean>;
  /** Reordena um grupo de temas irmãos (mesma raiz ou mesmo pai) pra ficar na ordem dos IDs passados */
  reordenarTemas: (idsNaOrdem: string[]) => Promise<Tema[]>;
};
