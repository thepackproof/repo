export const colors = {
  ink: '#F4F8FB',
  muted: '#8EA4B7',
  background: '#06111F',
  surface: '#0C1A2A',
  surfaceRaised: '#112338',
  border: '#1B344B',
  teal: '#21D4B4',
  tealDark: '#0A5F55',
  blue: '#68A9FF',
  amber: '#FFBE55',
  danger: '#FF6B76',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
