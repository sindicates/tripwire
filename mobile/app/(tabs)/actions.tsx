import { SafeAreaView, ScrollView, StyleSheet, Text } from "react-native"
import { Colors } from "@/constants/colors"

export default function ActionsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Action Items</Text>
        {/* Grouped action packets by severity */}
        {/* Resolved / dismissed actions */}
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
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.light.foreground,
  },
})
