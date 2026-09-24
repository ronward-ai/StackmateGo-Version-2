export function useAuth() {
  return {
    user: { id: 'u1', email: 'ron@example.com', name: 'Ron Ward', firstName: 'Ron', lastName: 'Ward' },
    isLoading: false,
    isAuthenticated: true,
    isAnonymous: false,
    login: async () => {}, loginWithEmail: async () => {},
    register: async () => {}, registerWithEmail: async () => {},
    resetPassword: async () => {}, signInAnonymously: async () => {},
    logout: async () => {},
    loginError: undefined, registerError: undefined,
  } as any;
}
