import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "fi.lasikiilto.admin",
  appName: "Lasikiilto Admin",
  webDir: "dist",
  server: {
    // In dev, load from local Vite server (comment out for production builds)
    // url: "http://192.168.1.X:5174",
    // cleartext: true,
  },
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    scheme: "Lasikiilto Admin",
    backgroundColor: "#1e3a8a",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#ffffff",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "light",
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
