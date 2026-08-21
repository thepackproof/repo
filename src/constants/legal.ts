import Constants from 'expo-constants';

export const CURRENT_TERMS_VERSION = '2026.08.20';
export const CURRENT_PRIVACY_VERSION = '2026.08.20';
export const CURRENT_POLICY_EFFECTIVE_DATE = 'August 20, 2026';
export const CURRENT_APP_VERSION = Constants.expoConfig?.version ?? '0.9.6.0';
export const LEGAL_AFFIRMATION = 'I AGREE';
const extraLegalBaseUrl = typeof Constants.expoConfig?.extra?.legalBaseUrl === 'string'
  ? Constants.expoConfig.extra.legalBaseUrl
  : '';
export const LEGAL_BASE_URL = (process.env.EXPO_PUBLIC_LEGAL_BASE_URL || extraLegalBaseUrl || 'https://packproof-4cf53.web.app').replace(/\/$/, '');
