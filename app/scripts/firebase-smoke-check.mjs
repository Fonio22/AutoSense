import assert from 'node:assert/strict';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';

const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;

assert(email, 'SMOKE_EMAIL is required');
assert(password, 'SMOKE_PASSWORD is required');

const app = initializeApp({
  apiKey: 'AIzaSyCYsE79pTyaWJrx6aAjOQuCyouB25jR2Cc',
  authDomain: 'autosense-1178d.firebaseapp.com',
  projectId: 'autosense-1178d',
  storageBucket: 'autosense-1178d.firebasestorage.app',
  messagingSenderId: '985890980686',
  appId: '1:985890980686:web:28b2afa3ccf718e33b141f',
});

const auth = getAuth(app);
const db = getFirestore(app);

const { user } = await signInWithEmailAndPassword(auth, email, password);

const profileSnapshot = await getDoc(doc(db, 'users', user.uid));
assert.ok(profileSnapshot.exists(), 'expected one Firestore profile');

const profile = profileSnapshot.data();
for (const key of ['alerts', 'dashboard', 'settings', 'vehicle', 'realtime']) {
  assert.ok(profile[key], `missing profile.${key}`);
}

const tripsSnapshot = await getDocs(collection(db, 'users', user.uid, 'trips'));
assert.ok(tripsSnapshot.size >= 5, `expected at least 5 trips, got ${tripsSnapshot.size}`);

const autoTrip = tripsSnapshot.docs.find((trip) => trip.data().title === 'Viaje automático');
assert.ok(autoTrip, 'expected an automatic OBD trip');

console.log(JSON.stringify({
  uid: user.uid,
  profileKeys: Object.keys(profile).sort(),
  tripCount: tripsSnapshot.size,
  autoTripId: autoTrip.id,
}, null, 2));
