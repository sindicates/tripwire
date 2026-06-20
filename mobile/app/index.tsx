import { Redirect } from "expo-router"

export default function Index() {
  // TODO: check auth state from secure storage and redirect accordingly
  const isAuthenticated = false

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />
  }

  return <Redirect href="/(tabs)" />
}
