import type { ExpoConfig } from 'expo/config';

const value = (name: string, fallback = '') => process.env[name]?.trim() || fallback;
const facebookEnabled = process.env.EXPO_PUBLIC_ENABLE_FACEBOOK_AUTH?.trim().toLowerCase() === 'true';
const facebookAppId = value('FACEBOOK_APP_ID');
const facebookClientToken = value('FACEBOOK_CLIENT_TOKEN');
if (facebookEnabled && (!facebookAppId || !facebookClientToken)) {
  throw new Error('Facebook sign-in is enabled, but FACEBOOK_APP_ID or FACEBOOK_CLIENT_TOKEN is empty.');
}

const plugins: NonNullable<ExpoConfig['plugins']> = [
  'expo-router',
  'expo-image',
  'expo-sharing',
  '@react-native-firebase/app',
  '@react-native-firebase/app-check',
  ['expo-splash-screen', { backgroundColor: '#F9FAFB', image: './assets/brand/packproof-icon-v2.png', imageWidth: 112 }],
  ['expo-camera', { cameraPermission: 'Allow PackProof to record transaction evidence.', microphonePermission: 'Allow PackProof to record audio with evidence videos.', recordAudioAndroid: true }],
  ['expo-location', { locationWhenInUsePermission: 'Allow PackProof to include an optional precise capture location in the private service-authenticated evidence manifest.' }],
  ['expo-image-picker', { photosPermission: 'Allow PackProof to attach item and condition photos.', cameraPermission: 'Allow PackProof to photograph transaction evidence.' }],
  ['expo-document-picker', { iCloudContainerEnvironment: 'Production' }],
  ['expo-notifications', { icon: './assets/images/android-icon-monochrome.png', color: '#467C63' }],
  ['expo-secure-store', { configureAndroidBackup: true }],
  ['expo-local-authentication', { faceIDPermission: 'Allow PackProof to protect sensitive evidence.' }],
  ['expo-build-properties', { android: { compileSdkVersion: 36, targetSdkVersion: 36, minSdkVersion: 26, kotlinVersion: '2.2.20', enableProguardInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true } }],
  './plugins/with-packproof-gradle-properties',
  '@react-native-google-signin/google-signin',
];

if (facebookEnabled && facebookAppId && facebookClientToken) {
  plugins.push(['react-native-fbsdk-next', {
    appID: facebookAppId,
    clientToken: facebookClientToken,
    displayName: 'PackProof',
    scheme: `fb${facebookAppId}`,
    advertiserIDCollectionEnabled: false,
    autoLogAppEventsEnabled: false,
    isAutoInitEnabled: true,
  }]);
}

const config: ExpoConfig = {
  name: 'PackProof',
  slug: 'packproof',
  owner: value('EXPO_OWNER', 'packproof-llc'),
  version: '0.3.0',
  orientation: 'portrait',
  icon: './assets/brand/packproof-icon-v2.png',
  scheme: 'packproof',
  userInterfaceStyle: 'light',
  runtimeVersion: { policy: 'appVersion' },
  updates: { fallbackToCacheTimeout: 0 },
  android: {
    package: value('ANDROID_PACKAGE_NAME', 'com.packproof.app'),
    versionCode: 4,
    // Queue ciphertext is intentionally device-bound to Android Keystore keys.
    // Restoring it onto another install would create undecryptable evidence, so
    // application-data backup is disabled and sync remains the recovery path.
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: '#F9FAFB',
      foregroundImage: './assets/brand/packproof-icon-v2.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
    intentFilters: [{
      action: 'VIEW',
      autoVerify: true,
      data: [
        { scheme: 'https', host: value('PACKPROOF_LINK_DOMAIN', 'packproof.link'), pathPrefix: '/connect/capture' },
        { scheme: 'https', host: value('PACKPROOF_LINK_DOMAIN', 'packproof.link'), pathPrefix: '/handoff/review' },
        { scheme: 'https', host: value('PACKPROOF_LINK_DOMAIN', 'packproof.link'), pathPrefix: '/claim/participant' },
        { scheme: 'https', host: value('PACKPROOF_LINK_DOMAIN', 'packproof.link'), pathPrefix: '/evidence-session/redeem' },
        { scheme: 'https', host: value('PACKPROOF_LINK_DOMAIN', 'packproof.link'), pathPrefix: '/invite' },
      ],
      category: ['BROWSABLE', 'DEFAULT'],
    }],
    blockedPermissions: [
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_CONTACTS',
      'android.permission.WRITE_CONTACTS',
      // Billing and advertising remain out of the initial Android release.
      // Transitive SDK manifests must not silently reintroduce these grants.
      'com.android.vending.BILLING',
      'com.google.android.gms.permission.AD_ID',
      'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
      'android.permission.ACCESS_ADSERVICES_AD_ID',
      'android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE',
      'android.permission.ACCESS_ADSERVICES_TOPICS',
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins,
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    eas: { projectId: value('EXPO_PROJECT_ID', '0196c3f7-cb3a-472c-99be-825558f227e8') },
    legalBaseUrl: value('EXPO_PUBLIC_LEGAL_BASE_URL', 'https://example.invalid'),
  },
};

export default config;
