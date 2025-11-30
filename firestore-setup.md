# Firestore Setup Instructions

It seems like the application cannot connect to the Firestore database. This usually happens if the database hasn't been created in the Firebase Console yet.

Please follow these steps to fix it:

1.  **Go to Firebase Console**:
    *   Open [https://console.firebase.google.com/](https://console.firebase.google.com/)
    *   Select your project: **israelcoliving**

2.  **Create Firestore Database**:
    *   In the left menu, click on **Build** -> **Firestore Database**.
    *   Click on the **Create Database** button.

3.  **Configure Security Rules**:
    *   Choose **Start in Test Mode** (this allows read/write access for 30 days, which is good for development).
    *   Click **Next**.

4.  **Select Location**:
    *   Choose a location (e.g., `eur3` for Europe or `us-central1`).
    *   Click **Enable**.

5.  **Wait for Provisioning**:
    *   Wait a few moments for the database to be created.

6.  **Verify**:
    *   Once created, you should see a "Data", "Rules", "Indexes" tab interface.
    *   Go back to your application and try to save the profile again.

## Troubleshooting
If you have already created the database, please check the **Rules** tab in Firestore and ensure it looks like this for development:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
