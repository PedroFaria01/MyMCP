// Processo principal do Electron.
// Cria a janela e faz a ponte (IPC) entre a interface e a camada de
// armazenamento — o renderer nunca toca no sistema de arquivos direto,
// só fala com o main process através do preload.

import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  lerTodasAsNotas,
  buscarNotas,
  adicionarNota,
  atualizarNota,
  removerNota,
  listarTemas,
  adicionarTema,
  renomearTema,
  removerTema,
  reordenarTemas,
} from '../shared/armazenamento.js';
import type { NovaNota, NovoTema } from '../shared/tipos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DIST_ELECTRON = path.join(__dirname, '..');
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist');
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST;

let janelaPrincipal: BrowserWindow | null = null;

function criarJanela(): void {
  janelaPrincipal = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#1b1b23', // evita "flash" branco antes do React montar
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    janelaPrincipal.loadURL(process.env.VITE_DEV_SERVER_URL);
    janelaPrincipal.webContents.openDevTools({ mode: 'detach' });
  } else {
    janelaPrincipal.loadFile(path.join(process.env.DIST as string, 'index.html'));
  }
}

// Cada canal IPC espelha uma função de src/shared/armazenamento.ts —
// é o servidor MCP em miniatura, só que falando com a própria UI.
ipcMain.handle('notas:listar', () => lerTodasAsNotas());
ipcMain.handle('notas:buscar', (_evento, consulta: string) => buscarNotas(consulta));
ipcMain.handle('notas:adicionar', (_evento, nova: NovaNota) => adicionarNota(nova));
ipcMain.handle('notas:atualizar', (_evento, id: string, alteracoes: Partial<NovaNota>) =>
  atualizarNota(id, alteracoes),
);
ipcMain.handle('notas:remover', (_evento, id: string) => removerNota(id));

ipcMain.handle('temas:listar', () => listarTemas());
ipcMain.handle('temas:adicionar', (_evento, novo: NovoTema) => adicionarTema(novo));
ipcMain.handle('temas:renomear', (_evento, id: string, nome: string) => renomearTema(id, nome));
ipcMain.handle('temas:remover', (_evento, id: string) => removerTema(id));
ipcMain.handle('temas:reordenar', (_evento, idsNaOrdem: string[]) => reordenarTemas(idsNaOrdem));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    janelaPrincipal = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) criarJanela();
});

app.whenReady().then(criarJanela);
