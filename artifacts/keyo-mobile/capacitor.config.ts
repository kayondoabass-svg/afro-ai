import type { CapacitorConfig } from '@capacitor/cli';
const config:CapacitorConfig={
  appId:'com.keyostudio.app',
  appName:'KEYO Studio',
  webDir:'dist/public',
  // Assets are bundled in the APK. No remote server URL or insecure navigation.
  server:{androidScheme:'https'},
  android:{allowMixedContent:false},
};
export default config;
