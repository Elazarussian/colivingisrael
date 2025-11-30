import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDFWN7Axe7VfD3Pb7AOg3MmLB3v2QZrxxg",
    authDomain: "israelcoliving.firebaseapp.com",
    projectId: "israelcoliving",
    storageBucket: "israelcoliving.firebasestorage.app",
    messagingSenderId: "159508805874",
    appId: "1:159508805874:web:89a43ec63d45501954386b",
    measurementId: "G-R34FWGF3D1"
};

// Check if config is set
const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isConfigured) {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    // Initialize Firestore with offline persistence
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} else {
    console.warn('⚠️ Firebase not configured! Please update firebase-config.ts with your actual Firebase configuration.');
}

export { auth, db, app };
