import admin from 'firebase-admin';

async function test() {
  try {
    const app = admin.initializeApp({
      projectId: 'project-4d166fd9-5ce4-482d-924'
    });
    const auth = admin.auth(app);
    const token = await auth.createCustomToken('test-uid');
    console.log('Custom token:', token);
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
