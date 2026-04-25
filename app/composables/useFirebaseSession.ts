import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth'

export const useFirebaseSession = () => {
  const { $firebaseAuth } = useNuxtApp()

  const user = useState<User | null>('firebase-auth-user', () => null)
  const authReady = useState('firebase-auth-ready', () => false)
  const authPending = useState('firebase-auth-pending', () => false)
  const authError = useState<string | null>('firebase-auth-error', () => null)
  const listenerBound = useState('firebase-auth-listener-bound', () => false)

  if (import.meta.client && $firebaseAuth && !listenerBound.value) {
    listenerBound.value = true

    onAuthStateChanged($firebaseAuth, (nextUser) => {
      user.value = nextUser
      authReady.value = true
    })
  }

  const loginWithGoogle = async () => {
    if (!$firebaseAuth) {
      authError.value = 'Firebase Auth 설정이 비어 있어서 로그인할 수 없습니다. .env 값을 먼저 확인해주세요.'
      return
    }

    authPending.value = true
    authError.value = null

    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup($firebaseAuth, provider)
    } catch (error) {
      authError.value = error instanceof Error ? error.message : 'Google login failed'
    } finally {
      authPending.value = false
    }
  }

  const logout = async () => {
    if (!$firebaseAuth) {
      authError.value = 'Firebase Auth 설정이 비어 있습니다.'
      return
    }

    authPending.value = true
    authError.value = null

    try {
      await signOut($firebaseAuth)
    } catch (error) {
      authError.value = error instanceof Error ? error.message : 'Logout failed'
    } finally {
      authPending.value = false
    }
  }

  return {
    user,
    authReady,
    authPending,
    authError,
    loginWithGoogle,
    logout
  }
}
