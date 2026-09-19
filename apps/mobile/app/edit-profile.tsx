import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { BIO_MAX_LENGTH } from "@taskflow/shared";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMe, useUpdateProfile } from "../src/features/auth/useAuth";
import { Avatar } from "../src/ui/Avatar";
import { Button } from "../src/ui/Button";
import { TextField } from "../src/ui/FormField";
import { Screen } from "../src/ui/Screen";
import { ScreenHeader } from "../src/ui/ScreenHeader";
import { colors, fontSize, spacing } from "../src/ui/theme";

/**
 * Name + bio only — real, persisted fields (PATCH /auth/me). Username is
 * shown but not editable here: it's a separate, one-way identity decision
 * with its own uniqueness/normalization rules (FR-1a), not a general
 * profile-editing field. A profile photo isn't offered yet — uploading and
 * persistently storing an image needs a real storage provider decision that
 * hasn't been made, so there's nothing honest to build here until then.
 */
export default function EditProfileScreen() {
  const router = useRouter();
  const me = useMe();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (me.data) {
      setName(me.data.name);
      setBio(me.data.bio ?? "");
    }
  }, [me.data]);

  const trimmedName = name.trim();
  const canSave =
    trimmedName.length > 0 && bio.length <= BIO_MAX_LENGTH && !updateProfile.isPending;

  function handleSave() {
    if (!me.data) return;
    updateProfile.mutate(
      { name: trimmedName, bio: bio.trim() || null },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Edit Profile" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {me.data && (
            <>
              <View style={styles.avatarRow}>
                <Avatar name={me.data.name} size={80} />
              </View>

              <TextField
                label="Name"
                accessibilityLabel="Name"
                value={name}
                onChangeText={setName}
              />

              <View>
                <Text style={styles.label}>Username</Text>
                <View style={styles.readOnlyField}>
                  <Text style={styles.readOnlyText}>@{me.data.username}</Text>
                </View>
              </View>

              <View>
                <TextField
                  label="Bio"
                  placeholder="Tell people a little about yourself"
                  accessibilityLabel="Bio"
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  maxLength={BIO_MAX_LENGTH}
                />
                <Text
                  style={[styles.counter, bio.length >= BIO_MAX_LENGTH && styles.counterAtLimit]}
                >
                  {bio.length}/{BIO_MAX_LENGTH}
                </Text>
              </View>

              <Button
                label="Save Changes"
                disabled={!canSave}
                loading={updateProfile.isPending}
                onPress={handleSave}
              />

              {updateProfile.isError && (
                <Text style={styles.error} accessibilityRole="alert">
                  Could not save — please try again.
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  avatarRow: { alignItems: "center", marginBottom: spacing.sm },
  label: { fontSize: fontSize.meta, fontWeight: "600", color: colors.textSecondary },
  readOnlyField: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.neutral,
  },
  readOnlyText: { fontSize: fontSize.body, color: colors.textMuted },
  counter: {
    fontSize: fontSize.tiny,
    color: colors.textMuted,
    textAlign: "right",
    marginTop: spacing.xs,
  },
  counterAtLimit: { color: colors.danger },
  error: { color: colors.danger, fontSize: fontSize.meta },
});
