# Firebase Functions & Emulators

## Deploying Functions
To deploy the Cloud Functions to the live Firebase environment (Production), run:

```bash
npm run deploy:functions
```

This will deploy only the functions. To deploy the hosting (frontend) as well, run `npm run deploy`.

## Running Emulators
To run the Firebase Emulators locally (for testing without affecting real data), run:

```bash
npm run serve:emulators
```

This will start the Firestore, Auth, and Functions emulators.
You may need to configure your Angular app to connect to these emulators in `src/app/app.config.ts` or `src/main.ts`.
