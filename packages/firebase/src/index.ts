// Shared Firebase client init and Firestore type definitions.
export { getFirebaseApp, getFirebaseAuth, getDb, getFirebaseMessaging } from './client';
export { getFirebaseConfig, useEmulators } from './config';
export type { Item, ItemHistory, User, Site, ItemStatus } from './types';
