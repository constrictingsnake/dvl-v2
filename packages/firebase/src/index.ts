// Shared Firebase client init and Firestore type definitions.
export { getFirebaseApp, getFirebaseAuth, getDb, getFirebaseMessaging } from './client';
export { getFirebaseConfig, useEmulators } from './config';
export type {
  Item,
  ItemHistory,
  ItemData,
  User,
  FcmToken,
  Site,
  ListingType,
  ItemStatus,
  BidStatus,
  NotificationPrefs,
  NotificationState,
  FsTimestamp,
  WithId,
} from './types';
