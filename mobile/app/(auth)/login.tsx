import { SafeAreaView, StyleSheet, Text, View } from "react-native"
import { Colors } from "@/constants/colors"

export default function LoginScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Sign in to Tripwire</Text>
        <Text style={styles.subtitle}>Enter your credentials to continue</Text>
        {/* Login form */}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.light.foreground,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.light.mutedForeground,
  },
})
