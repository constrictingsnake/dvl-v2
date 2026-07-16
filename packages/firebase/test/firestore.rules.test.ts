import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const RULES_PATH = fileURLToPath(new URL('../../../firestore.rules', import.meta.url));

let testEnv: RulesTestEnvironment;

const ALICE = 'alice';
const BOB = 'bob';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'dvl-auction-tracker',
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('firestore.rules — per-user access', () => {
  it('allows a user to read their own user doc', async () => {
    const aliceDb = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(getDoc(doc(aliceDb, 'users', ALICE)));
  });

  it('allows a user to write their own user doc', async () => {
    const aliceDb = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(aliceDb, 'users', ALICE), { displayName: 'Alice' }));
  });

  it('allows a user to read/write their own items subcollection', async () => {
    const aliceDb = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(
      setDoc(doc(aliceDb, 'users', ALICE, 'items', 'some-item-id'), { url: 'https://example.com' }),
    );
  });

  it('denies reading another user’s doc', async () => {
    const aliceDb = testEnv.authenticatedContext(ALICE).firestore();
    await assertFails(getDoc(doc(aliceDb, 'users', BOB)));
  });

  it('denies writing another user’s doc', async () => {
    const aliceDb = testEnv.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(aliceDb, 'users', BOB), { displayName: 'Alice' }));
  });

  it('denies an unauthenticated read', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'users', ALICE)));
  });

  it('denies an unauthenticated write', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(unauthDb, 'users', ALICE), { displayName: 'Alice' }));
  });
});
