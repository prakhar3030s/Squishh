import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.prakhar.squishh',
  appName: 'Squishh',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  cordova: {
    accessOrigins: [],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#141618',
      showSpinner: false,
    },
    StatusBar: {
      // DARK = light system bar icons on the #141618 dark background
      style: 'DARK',
      backgroundColor: '#141618',
    },
  },
};

export default config;
