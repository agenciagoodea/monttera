import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function getPublicAssetUrl(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^digitalbordados\.com\.br\//i.test(raw)) {
    return `https://${raw.replace(/^\/+/, '')}`;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const domain = 'https://digitalbordados.com.br';
  const noLeadingSlash = raw.replace(/^\/+/, '');

  if (raw.startsWith('/wp-content/uploads/')) {
    return `${domain}${raw}`;
  }

  if (raw.startsWith('wp-content/uploads/')) {
    return `${domain}/${noLeadingSlash}`;
  }

  if (raw.startsWith('/uploads/')) {
    return `${domain}${raw}`;
  }

  if (raw.startsWith('uploads/')) {
    return `${domain}/${noLeadingSlash}`;
  }

  if (raw.startsWith('/')) {
    return `${domain}${raw}`;
  }

  return `${domain}/${noLeadingSlash}`;
}

export function normalizePublicMediaUrl(value?: string | null): string {
  return getPublicAssetUrl(value);
}

export function isNewProduct(
  createdAt?: string | null,
  configuredDays?: number | string | null,
  manualOverride?: boolean,
): boolean {
  if (manualOverride) return true;

  const days = Number(configuredDays);
  if (!Number.isFinite(days) || days <= 0) return false;

  const raw = String(createdAt || '').trim();
  if (!raw) return false;

  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
  const normalized = hasTimezone ? raw : `${raw.replace(' ', 'T')}Z`;
  const createdTime = new Date(normalized).getTime();
  if (Number.isNaN(createdTime)) return false;

  const ageMs = Date.now() - createdTime;
  if (ageMs < 0) return true;

  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays < days;
}
