// Quick script to check and set admin role
// Run this in browser console while logged in

async function checkAndSetAdmin() {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    const { getFirestore, doc, getDoc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    const auth = getAuth();
    const db = getFirestore();
    const user = auth.currentUser;

    if (!user) {
        console.error('No user logged in!');
        return;
    }

    console.log('Current user UID:', user.uid);
    console.log('Current user email:', user.email);

    const profileRef = doc(db, 'profiles', user.uid);
    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
        const data = profileSnap.data();
        console.log('Current profile data:', data);
        console.log('Current role:', data.role);

        // Set admin role
        await setDoc(profileRef, { role: 'admin' }, { merge: true });
        console.log('✅ Admin role set! Please refresh the page.');
    } else {
        console.error('Profile document does not exist!');
    }
}

checkAndSetAdmin();
