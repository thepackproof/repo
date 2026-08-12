export const colors = {
  // PackProof custom theme tokens supplied August 2026.
  background: '#F9FAFB',
  ink: '#1B2232',
  primary: '#467C63',
  secondary: '#EDF0F3',
  accent: '#E7EFEB',
  card: '#FFFFFF',
  mutedSurface: '#EDF0F3',
  border: '#DBE0E6',
  destructive: '#DC2828',

  // Semantic aliases used throughout the existing UI.
  surface: '#FFFFFF',
  surfaceRaised: '#EDF0F3',
  muted: '#5C6678',
  teal: '#467C63',
  tealDark: '#315A47',
  blue: '#2D6A8A',
  amber: '#8A5B00',
  danger: '#DC2828',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const shadows = {
  card: {
    shadowColor: '#1B2232',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
