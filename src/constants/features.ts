const enabled = (value: string | undefined) => value?.trim().toLowerCase() === 'true';

export const featureFlags = {
  facebookAuth: enabled(process.env.EXPO_PUBLIC_ENABLE_FACEBOOK_AUTH),
  tiktokAuth: enabled(process.env.EXPO_PUBLIC_ENABLE_TIKTOK_AUTH),
  billing: enabled(process.env.EXPO_PUBLIC_ENABLE_REVENUECAT_BILLING) && Boolean(process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY?.trim()),
  /** 15-frame research capture. Ordinary users never see this surface. */
  researchMode: enabled(process.env.EXPO_PUBLIC_ENABLE_RESEARCH_MODE),
};
