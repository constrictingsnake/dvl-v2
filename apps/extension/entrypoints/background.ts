import { getFirebaseApp, useEmulators } from '@dvl/firebase';

export default defineBackground(() => {
  const app = getFirebaseApp();
  console.log('Firebase initialized', {
    projectId: app.options.projectId,
    useEmulators,
  });
});
