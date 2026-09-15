// Preload — a única ponte entre o mundo isolado do renderer (React) e o
// processo principal. Expõe só o que a interface precisa, nada de acesso
// direto a Node ou filesystem no lado da UI (contextIsolation: true).

import { contextBridge, ipcRenderer } from 'electron';
import type { ApiHub } from '../shared/tipos.js';

const api: ApiHub = {
  listarNotas: () => ipcRenderer.invoke('notas:listar'),
  buscarNotas: (consulta) => ipcRenderer.invoke('notas:buscar', consulta),
  adicionarNota: (nota) => ipcRenderer.invoke('notas:adicionar', nota),
  atualizarNota: (id, alteracoes) => ipcRenderer.invoke('notas:atualizar', id, alteracoes),
  removerNota: (id) => ipcRenderer.invoke('notas:remover', id),
  listarTemas: () => ipcRenderer.invoke('temas:listar'),
  adicionarTema: (tema) => ipcRenderer.invoke('temas:adicionar', tema),
  renomearTema: (id, nome) => ipcRenderer.invoke('temas:renomear', id, nome),
  removerTema: (id) => ipcRenderer.invoke('temas:remover', id),
  reordenarTemas: (idsNaOrdem) => ipcRenderer.invoke('temas:reordenar', idsNaOrdem),
  abrirLink: (url) => ipcRenderer.invoke('shell:abrirExterno', url),
};

contextBridge.exposeInMainWorld('hub', api);
