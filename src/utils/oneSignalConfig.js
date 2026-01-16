import OneSignal from 'react-onesignal';

let isInitialized = false;

export const initOneSignal = async () => {
  if (isInitialized) {
    console.log('OneSignal already initialized');
    return true;
  }

  try {
    await OneSignal.init({
      appId: 'be86b5ac-f86f-469f-ba7a-a072736bd728',
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerPath: '/OneSignalSDKWorker.js',
      serviceWorkerParam: { scope: '/' },
      notifyButton: {
        enable: false,
      },
    });
    
    isInitialized = true;
    console.log('OneSignal initialized successfully');
    return true;
  } catch (error) {
    console.error('OneSignal initialization error:', error);
    return false;
  }
};

export const subscribeUser = async () => {
  try {
    await OneSignal.Slidedown.promptPush();
    return true;
  } catch (error) {
    console.error('Subscription error:', error);
    return false;
  }
};

export const isSubscribed = async () => {
  try {
    const permission = await OneSignal.Notifications.permission;
    return permission;
  } catch (error) {
    return false;
  }
};