// Formata datas ISO em texto relativo curto (pt), pra usar nos cartões de nota.

export function formatarDataRelativa(iso: string): string {
  const data = new Date(iso);
  const diffMin = Math.round((Date.now() - data.getTime()) / 60000);

  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;

  const diffHoras = Math.round(diffMin / 60);
  if (diffHoras < 24) return `há ${diffHoras}h`;

  const diffDias = Math.round(diffHoras / 24);
  if (diffDias === 1) return 'ontem';
  if (diffDias < 7) return `há ${diffDias} dias`;

  return data.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}
