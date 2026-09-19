import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "../src/ui/Screen";
import { ScreenHeader } from "../src/ui/ScreenHeader";
import { colors, fontSize, radius, spacing } from "../src/ui/theme";

const FAQS: { question: string; answer: string }[] = [
  {
    question: "What happens when I assign a task to someone?",
    answer:
      "It shows up as pending in their Inbox. Nothing changes on your side until they respond — you're still responsible for it until they accept.",
  },
  {
    question: "What's the difference between Scheduled and Deadline?",
    answer:
      "Scheduled is when you plan to work on something. Deadline is when it must be done by. A task can have either, both, or neither.",
  },
  {
    question: "Who picks the schedule after I accept a task?",
    answer:
      "You do. When you accept an assignment, you choose when it goes on your own schedule (or leave it unscheduled) — the sender's plans for it are never carried over.",
  },
  {
    question: "Can I still see a task after I hand it off?",
    answer:
      "If you created it, yes — as a read-only entry so you can track its status, but you won't see the new owner's personal schedule for it.",
  },
];

export default function HelpScreen() {
  return (
    <Screen>
      <ScreenHeader title="Help & Support" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Answers to common questions about how Nudge works.</Text>
        {FAQS.map((item) => (
          <View key={item.question} style={styles.card}>
            <Text style={styles.question}>{item.question}</Text>
            <Text style={styles.answer}>{item.answer}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { fontSize: fontSize.body, color: colors.textSecondary, marginBottom: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  question: { fontSize: fontSize.body, fontWeight: "700", color: colors.textPrimary },
  answer: { fontSize: fontSize.meta, color: colors.textSecondary, lineHeight: 19 },
});
