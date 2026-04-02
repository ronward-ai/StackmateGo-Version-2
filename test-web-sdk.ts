import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

async function test() {
  try {
    const app = initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app, config.firestoreDatabaseId);

    try {
      await createUserWithEmailAndPassword(auth, 'server@example.com', 'password123');
      console.log('Created user');
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        await signInWithEmailAndPassword(auth, 'server@example.com', 'password123');
        console.log('Signed in');
      } else {
        throw e;
      }
    }

    await setDoc(doc(db, 'test', 'test'), { test: true });
    console.log('Success');
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
