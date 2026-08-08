import Purchases, { type CustomerInfo, type PurchasesOfferings, type PurchasesPackage } from 'react-native-purchases';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useAuth } from './auth-provider';
import { featureFlags } from '@/constants/features';

type PurchasesContextValue = {
  available: boolean;
  pro: boolean;
  managementUrl: string | null;
  offerings: PurchasesOfferings | null;
  loading: boolean;
  purchase: (selectedPackage: PurchasesPackage) => Promise<void>;
  restore: () => Promise<void>;
  refresh: () => Promise<void>;
};

const PurchasesContext = createContext<PurchasesContextValue | null>(null);
let configured = false;

const hasPro = (info: CustomerInfo) => Boolean(info.entitlements.active.pro);

export function PurchasesProvider({ children }: PropsWithChildren) {
  const { user, refreshProfile } = useAuth();
  const [pro, setPro] = useState(false);
  const [managementUrl, setManagementUrl] = useState<string | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [loading, setLoading] = useState(false);
  const available = featureFlags.billing;

  const refresh = useCallback(async () => {
    if (!user || !configured) return;
    const [info, nextOfferings] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]);
    setPro(hasPro(info));
    setManagementUrl(info.managementURL ?? null);
    setOfferings(nextOfferings);
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (configured) Purchases.logOut().catch(() => undefined);
      return;
    }
    let active = true;
    const setup = async () => {
      setLoading(true);
      const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY;
      if (!apiKey) return;
      if (!configured) { Purchases.configure({ apiKey, appUserID: user.uid }); configured = true; }
      else await Purchases.logIn(user.uid);
      if (active) await refresh();
    };
    setup().finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refresh, user]);

  const purchase = useCallback(async (selectedPackage: PurchasesPackage) => {
    setLoading(true);
    try {
      const result = await Purchases.purchasePackage(selectedPackage);
      setPro(hasPro(result.customerInfo));
      setManagementUrl(result.customerInfo.managementURL ?? null);
      await refreshProfile();
    } finally { setLoading(false); }
  }, [refreshProfile]);

  const restore = useCallback(async () => {
    setLoading(true);
    try {
      const info = await Purchases.restorePurchases();
      setPro(hasPro(info));
      setManagementUrl(info.managementURL ?? null);
      await refreshProfile();
    } finally { setLoading(false); }
  }, [refreshProfile]);

  const value = useMemo(() => ({
    available,
    pro: user ? pro : false,
    managementUrl: user ? managementUrl : null,
    offerings: user ? offerings : null,
    loading: user ? loading : false,
    purchase,
    restore,
    refresh,
  }), [available, user, pro, managementUrl, offerings, loading, purchase, restore, refresh]);
  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export function usePurchases() {
  const value = useContext(PurchasesContext);
  if (!value) throw new Error('usePurchases must be used inside PurchasesProvider.');
  return value;
}
