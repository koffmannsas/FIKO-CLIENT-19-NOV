import React from 'react';

export type FikoLogoVariant = 'full' | 'symbol';
export type FikoLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
export type FikoLogoSurface = 'dark' | 'light';

interface FikoConnectLogoProps {
  variant?: FikoLogoVariant;
  size?: FikoLogoSize;
  surface?: FikoLogoSurface;
  animated?: boolean;
  className?: string;
  alt?: string;
}

const FULL_SIZE_CLASSES: Record<FikoLogoSize, string> = {
  xs: 'h-7 w-auto max-w-[115px]',
  sm: 'h-9 w-auto max-w-[145px]',
  md: 'h-12 w-auto max-w-[190px]',
  lg: 'h-14 w-auto max-w-[230px]',
  xl: 'h-16 w-auto max-w-[270px]',
  hero: 'h-20 sm:h-24 w-auto max-w-[340px]',
};

const SYMBOL_SIZE_CLASSES: Record<FikoLogoSize, string> = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-14 w-14',
  hero: 'h-16 w-16',
};

export const OFFICIAL_LOGO_FULL_PATH = '/branding/fiko-connect-logo-official.png';
export const OFFICIAL_LOGO_SYMBOL_PATH = '/branding/fiko-connect-symbol-official.png';

/**
 * Composant officiel d'identité FIKO CONNECT™.
 * Utilise exclusivement le PNG officiel certifié (2016×780) ou son symbole hexagonal
 * extrait sans altération ni recoloration.
 */
export default function FikoConnectLogo({
  variant = 'full',
  size = 'md',
  surface = 'dark',
  animated = false,
  className = '',
  alt,
}: FikoConnectLogoProps) {
  const isSymbol = variant === 'symbol';
  const src = isSymbol ? OFFICIAL_LOGO_SYMBOL_PATH : OFFICIAL_LOGO_FULL_PATH;
  const sizeClass = isSymbol ? SYMBOL_SIZE_CLASSES[size] : FULL_SIZE_CLASSES[size];
  const resolvedAlt =
    alt || (isSymbol ? 'Symbole Fiko Connect' : 'Fiko Connect — Turn Conversations Into Growth');

  const imgElement = (
    <img
      src={src}
      alt={resolvedAlt}
      width={isSymbol ? 512 : 2016}
      height={isSymbol ? 512 : 780}
      draggable={false}
      className={`${sizeClass} object-contain select-none shrink-0 ${
        animated ? 'animate-[pulse_2.4s_ease-in-out_infinite]' : ''
      } ${surface === 'dark' ? className : ''}`}
    />
  );

  // Règle officielle de contraste : sur fond clair, placer dans un conteneur sombre graphite.
  if (surface === 'light') {
    return (
      <div
        className={`inline-flex items-center justify-center bg-[#0a0a0f] border border-zinc-800/90 rounded-xl px-3 py-1.5 shadow-sm ${className}`}
      >
        {imgElement}
      </div>
    );
  }

  return imgElement;
}
