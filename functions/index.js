const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

/**
 * Cloud Function to delete a user from Firebase Authentication
 * Only callable by users with admin role
 */
exports.deleteUser = functions.https.onCall(async (data, context) => {
    // Check if the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated to delete users'
        );
    }

    // Get the dbPath from data (defaults to 'realdata/db' or 'profiles' if missing, but we should enforce it)
    const dbPath = data.dbPath;
    if (!dbPath || typeof dbPath !== 'string') {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'dbPath is required'
        );
    }

    // Get the calling user's profile to check if they're an admin
    const callerUid = context.auth.uid;
    const callerProfileDoc = await admin.firestore()
        .collection(`${dbPath}profiles`)
        .doc(callerUid)
        .get();

    const callerProfile = callerProfileDoc.data();

    // Check if caller has admin role
    if (!callerProfile || callerProfile.role !== 'admin') {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only administrators can delete users'
        );
    }

    // Get the UID of the user to delete
    const uid = data.uid;

    if (!uid || typeof uid !== 'string') {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'User ID (uid) is required'
        );
    }

    // Prevent admin from deleting themselves
    if (uid === callerUid) {
        throw new functions.https.HttpsError(
            'failed-precondition',
            'Cannot delete your own account'
        );
    }

    try {
        // Delete the user from Firebase Authentication
        await admin.auth().deleteUser(uid);

        // Also delete from Firestore profiles collection
        await admin.firestore()
            .collection(`${dbPath}profiles`)
            .doc(uid)
            .delete();

        console.log(`User ${uid} deleted successfully by admin ${callerUid}`);

        return {
            success: true,
            message: `User ${uid} deleted successfully`,
        };
    } catch (error) {
        console.error('Error deleting user:', error);

        // Handle specific error cases
        if (error.code === 'auth/user-not-found') {
            throw new functions.https.HttpsError(
                'not-found',
                'User not found in Firebase Authentication'
            );
        }

        throw new functions.https.HttpsError(
            'internal',
            `Failed to delete user: ${error.message}`
        );
    }
});

// CORS-friendly HTTP endpoint for deleting a user.
// This accepts POST requests with JSON { uid } and an Authorization: Bearer <idToken> header.
// It performs the same checks as the callable function but responds with JSON and CORS headers
// so it can be called directly from browsers during development.
exports.deleteUserHttp = functions.https.onRequest(async (req, res) => {
    // Allow localhost dev origin and production domains as needed
    const allowedOrigin = req.get('Origin') || req.get('origin') || '';
    const devOrigin = 'http://localhost:4200';
    const originToSet = (allowedOrigin === devOrigin) ? devOrigin : '*';

    res.set('Access-Control-Allow-Origin', originToSet);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        // CORS preflight
        return res.status(204).send('');
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Authenticate caller using ID token from Authorization header
        const authHeader = req.get('Authorization') || '';
        const match = authHeader.match(/^Bearer\s+(.+)$/);
        if (!match) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const idToken = match[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        const callerUid = decoded.uid;

        const dbPath = (req.body && req.body.dbPath) || '';
        if (req.body.dbPath && typeof req.body.dbPath !== 'string') {
            return res.status(400).json({ error: 'invalid-argument: dbPath must be a string' });
        }

        // Get caller profile
        const callerProfileDoc = await admin.firestore()
            .collection(`${dbPath}profiles`)
            .doc(callerUid)
            .get();
        const callerProfile = callerProfileDoc.data();

        if (!callerProfile || callerProfile.role !== 'admin') {
            return res.status(403).json({ error: 'permission-denied' });
        }

        const uid = req.body && req.body.uid;
        if (!uid || typeof uid !== 'string') {
            return res.status(400).json({ error: 'invalid-argument' });
        }

        if (uid === callerUid) {
            return res.status(412).json({ error: 'failed-precondition' });
        }

        // Delete user from Auth and Firestore
        await admin.auth().deleteUser(uid);
        await admin.firestore().collection(`${dbPath}profiles`).doc(uid).delete();

        console.log(`User ${uid} deleted successfully by admin ${callerUid}`);

        return res.json({ success: true, message: `User ${uid} deleted successfully` });
    } catch (error) {
        console.error('HTTP deleteUser error:', error);
        // If verifyIdToken failed, ensure we don't leak internal details
        return res.status(500).json({ error: (error && error.message) ? error.message : 'internal' });
    }
});
