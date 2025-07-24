import { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard'; 

const config: CapacitorConfig = {
  appId: 'com.company.myvoidchat',
  appName: 'voidchat',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'myvoidchat.onrender.com',
      'cdnjs.cloudflare.com'
    ]
  },
  // ▼▼▼-- هذا هو القسم الجديد والمهم --▼▼▼
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Body, 
      resizeOnFullScreen: true    
    }
  }
  
};

export default config;
