import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.gastei',
  appName: 'Gastei',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
