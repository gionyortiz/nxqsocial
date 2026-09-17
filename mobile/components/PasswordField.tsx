import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

type PasswordFieldProps = Omit<TextInputProps, 'secureTextEntry'> & {
  label?: string;
  newPassword?: boolean;
  disableAutofill?: boolean;
};

// Mirrors the backend's StrongPassword rule (min 12, upper, lower, digit, special).
// iOS needs this on textContentType="newPassword" fields or its Automatic Strong
// Password AutoFill UI can take over the field and swallow keystrokes.
const PASSWORD_RULES = 'minlength: 12; required: lower; required: upper; required: digit; required: special; allowed: ascii-printable;';

export function PasswordField({
  label = 'Password',
  newPassword = false,
  disableAutofill = false,
  placeholder = 'Enter your password',
  ...inputProps
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.fieldShell, focused && styles.fieldShellFocused]}>
        <Ionicons name="lock-closed-outline" size={20} color={focused ? '#a78bfa' : '#8790ab'} />
        <TextInput
          {...inputProps}
          placeholder={placeholder}
          placeholderTextColor="#6f7b96"
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete={disableAutofill ? 'off' : (Platform.OS === 'ios' ? undefined : (newPassword ? 'new-password' : 'current-password'))}
          textContentType={disableAutofill ? 'none' : (Platform.OS === 'ios' ? (newPassword ? 'newPassword' : 'password') : undefined)}
          passwordRules={!disableAutofill && Platform.OS === 'ios' && newPassword ? PASSWORD_RULES : undefined}
          importantForAutofill={disableAutofill ? 'no' : 'yes'}
          style={styles.input}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          accessibilityHint="Toggles whether the password is visible"
          hitSlop={10}
          onPress={() => setVisible((current) => !current)}
          style={({ pressed }) => [styles.visibilityButton, pressed && styles.visibilityButtonPressed]}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={24} color="#b8c1d9" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    gap: 7,
  },
  label: {
    color: '#c9d1e5',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 2,
  },
  fieldShell: {
    alignItems: 'center',
    backgroundColor: '#151d33',
    borderColor: '#293451',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    paddingLeft: 14,
  },
  fieldShellFocused: {
    borderColor: '#8b5cf6',
    shadowColor: '#7c3aed',
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  input: {
    color: '#ffffff',
    flex: 1,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 11,
    paddingVertical: 13,
  },
  visibilityButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: 52,
  },
  visibilityButtonPressed: {
    opacity: 0.55,
  },
});
