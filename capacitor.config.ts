import { CapacitorConfig } from '@capacitor/cli';


const config: CapacitorConfig = {
  appId: 'com.takachi.chatchi',
  appName: 'Chatchi',
  webDir: 'public',
  server: {
    url: 'https://chatchi.onrender.com/',
    androidScheme: 'https'
  }

};

export default config;
