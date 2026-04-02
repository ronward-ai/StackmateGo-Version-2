import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

async function test() {
  try {
    const app = initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app, config.firestoreDatabaseId);

    // We can't easily get a real ID token here, but we can check if the method exists and doesn't throw immediately
    console.log('Auth initialized');
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
