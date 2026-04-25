import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()

  const firebaseConfig = {
    apiKey: config.public.firebaseApiKey,
    authDomain: config.public.firebaseAuthDomain,
    projectId: config.public.firebaseProjectId,
    storageBucket: config.public.firebaseStorageBucket,
    messagingSenderId: config.public.firebaseMessagingSenderId,
    appId: config.public.firebaseAppId,
    measurementId: config.public.firebaseMeasurementId
  }

  const hasRequiredConfig = Object.values(firebaseConfig).every(Boolean)

  if (!hasRequiredConfig) {
    return {
      provide: {
        firebaseApp: null,
        firebaseAuth: null,
        firestore: null,
        analytics: null
      }
    }
  }

  const firebaseApp = initializeApp(firebaseConfig)
  const firebaseAuth = getAuth(firebaseApp)
  const firestore = getFirestore(firebaseApp)

  let analytics: unknown = null

  const analyticsModule = await import('firebase/analytics')

  if (await analyticsModule.isSupported()) {
    analytics = analyticsModule.getAnalytics(firebaseApp)
  }

  return {
    provide: {
      firebaseApp,
      firebaseAuth,
      firestore,
      analytics
    }
  }
})
