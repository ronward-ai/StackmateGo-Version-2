import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

async function test() {
  try {
    const app = admin.initializeApp({
      projectId: 'project-4d166fd9-5ce4-482d-924'
    });
    const db = getFirestore(app, 'ai-studio-127bb0ae-6c5c-42d1-a030-fd85760f05b1');
    await db.collection('test').doc('test').set({ test: true });
    console.log('Success');
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
