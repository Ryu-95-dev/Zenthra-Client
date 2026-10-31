import type { ZenthraApi } from '@shared/api';

declare global {
  interface Window {
    zenthra: ZenthraApi;
  }
}

export const api = window.zenthra;

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')} k`;
  return String(n);
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} Go`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(n / 1024))} Ko`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'Jamais lancé';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "À l'instant";
  if (s < 3600) return `Il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `Il y a ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'Hier' : `Il y a ${d} jours`;
}
