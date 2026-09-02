import Ionicons from '@expo/vector-icons/Ionicons';
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

type PasswordFieldProps = Omit<TextInputProps, 'secureTextEntry' | 'multiline' | 'autoComplete' | 'textContentType' | 'passwordRules'> & {
  label?: string;
  newPassword?: boolean;
  disableAutofill?: boolean;
  inputRef?: RefObject<TextInput | null>;
};

// Mirrors the backend's StrongPassword rule (min 12, upper, lower, digit, special).
// Screens that opt into iOS Password AutoFill use these rules. Screens that have
// shown the iOS strong-password input lockout use disableAutofill instead so the
// native TextInput uses the manual-entry path. Real-device QA is still required.
const PASSWORD_RULES = 'minlength: 12; required: lower; required: upper; required: digit; required: special; allowed: ascii-printable;';

export function PasswordField({
  label = 'Password',
  newPassword = false,
  disableAutofill = true,
  inputRef: suppliedRef,
  placeholder = 'Enter your password',
  ...inputProps
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const localRef = useRef<TextInput>(null);
  const inputRef = suppliedRef ?? localRef;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setVisible(false);
    });
    return () => subscription.remove();
  }, []);
  useFocusEffect(useCallback(() => () => setVisible(false), []));
  useEffect(() => {
    if (!inputProps.value || inputProps.editable === false) setVisible(false);
  }, [inputProps.value, inputProps.editable]);

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label} onPress={() => inputRef.current?.focus()}>{label}</Text>
      <View style={[styles.fieldShell, focused && styles.fieldShellFocused]}>
        <View pointerEvents="none" accessible={false}>
          <Ionicons name="lock-closed-outline" size={20} color={focused ? '#a78bfa' : '#8790ab'} />
        </View>
        <TextInput
          {...inputProps}
          ref={inputRef}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          placeholder={placeholder}
          placeholderTextColor="#6f7b96"
          secureTextEntry={!visible}
          multiline={false}
          keyboardType="default"
          inputMode="text"
          clearTextOnFocus={false}
          selectTextOnFocus={false}
          contextMenuHidden={false}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete={disableAutofill ? 'off' : (Platform.OS === 'ios' ? undefined : (newPassword ? 'new-password' : 'current-password'))}
          textContentType={disableAutofill ? 'none' : (Platform.OS === 'ios' ? (newPassword ? 'newPassword' : 'password') : undefined)}
          passwordRules={!disableAutofill && Platform.OS === 'ios' && newPassword ? PASSWORD_RULES : undefined}
          importantForAutofill={disableAutofill ? 'no' : 'yes'}
          style={[styles.input, inputProps.style]}
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
          accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          accessibilityState={{ disabled: inputProps.editable === false, selected: visible }}
          testID={inputProps.testID ? `${inputProps.testID}-visibility` : undefined}
          disabled={inputProps.editable === false}
          accessibilityHint="Toggles whether the password is visible"
          // Keep the hit area inside its own 52px column; it must never cover
          // the editable field, including on narrow phones and with large text.
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
    minHeight: 54,
    minWidth: 0,
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
