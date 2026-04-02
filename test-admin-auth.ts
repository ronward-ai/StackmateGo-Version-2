import admin from 'firebase-admin';

async function test() {
  try {
    const app = admin.initializeApp({
      projectId: 'project-4d166fd9-5ce4-482d-924'
    });
    console.log('App initialized');
    // We can't easily test verifyIdToken without a real token, but we can check if it throws on initialization
    const auth = admin.auth(app);
    console.log('Auth initialized');
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
