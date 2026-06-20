import { KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, View } from "react-native"
import { Colors } from "@/constants/colors"

export default function ChatScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Text style={styles.title}>Ask Tripwire</Text>
        <View style={styles.thread}>
          {/* Message bubbles */}
        </View>
        <View style={styles.inputBar}>
          {/* Text input + send button */}
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.light.foreground,
    paddingVertical: 16,
  },
  thread: {
    flex: 1,
  },
  inputBar: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
})
