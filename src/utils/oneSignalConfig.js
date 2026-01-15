import OneSignal from 'react-onesignal';

export const initOneSignal = async () => {
  try {
    await OneSignal.init({
      appId: 'be86b5ac-f86f-469f-ba7a-a072736bd728',
      allowLocalhostAsSecureOrigin: true,
      notifyButton: {
        enable: false, // We'll use our custom button
      },
    });
    
    console.log('OneSignal initialized successfully');
    return true;
  } catch (error) {
    console.error('OneSignal initialization error:', error);
    return false;
  }
};

export const subscribeUser = async () => {
  try {
    await OneSignal.showSlidedownPrompt();
    return true;
  } catch (error) {
    console.error('Subscription error:', error);
    return false;
  }
};

export const isSubscribed = async () => {
  try {
    return await OneSignal.isPushNotificationsEnabled();
  } catch (error) {
    return false;
  }
};

export const sendNotification = async (title, message, url = null) => {
  // This would typically be done from a backend, but for testing:
  console.log('Notification to send:', { title, message, url });
  // You'll use OneSignal's REST API or dashboard to actually send
};