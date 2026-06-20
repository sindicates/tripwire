import { SafeAreaView, ScrollView, StyleSheet, Text } from "react-native"
import { Colors } from "@/constants/colors"

export default function OnboardingScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Set up your profile</Text>
        <Text style={styles.subtitle}>
          Tell us about your school and academic standing
        </Text>
        {/* Step 1: school search */}
        {/* Step 2: GPA + credits */}
        {/* Step 3: aid package upload */}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scroll: {
    padding: 24,
    gap: 12,
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
