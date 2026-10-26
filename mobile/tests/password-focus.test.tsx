import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PasswordField } from '../components/PasswordField';

// These test the specific JS-to-native prop contract. Jest cannot prove UIKit
// focus/keyboard behavior. A real-iPhone acceptance test is still mandatory.
function Harness({ onFocus = jest.fn(), onBlur = jest.fn() } = {}) {
  const [value, setValue] = useState('');
  return <PasswordField testID="focus-password" value={value} onChangeText={setValue} onFocus={onFocus} onBlur={onBlur} />;
}

function shell() {
  const result = screen.UNSAFE_getAllByType(View).find((node) => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.flexDirection === 'row' && style?.minHeight === 54;
  });
  if (!result) throw new Error('Password shell not found');
  return result;
}

test('focus changes border color only, not native grouping or layout properties', () => {
  render(<Harness />);
  const input = screen.getByTestId('focus-password');
  const before = StyleSheet.flatten(shell().props.style);
  fireEvent(input, 'focus', { nativeEvent: {} });
  const after = StyleSheet.flatten(shell().props.style);
  const { borderColor: beforeBorder, ...beforeRest } = before;
  const { borderColor: afterBorder, ...afterRest } = after;
  expect(afterBorder).not.toBe(beforeBorder);
  expect(afterRest).toEqual(beforeRest);
  expect(after.shadowColor).toBeUndefined();
});

test('native parent remains explicitly non-collapsable across 20 focus/blur cycles', () => {
  render(<Harness />);
  const input = screen.getByTestId('focus-password');
  expect(shell().props.collapsable).toBe(false);
  fireEvent.changeText(input, 'Fixture-Only-123');
  for (let cycle = 0; cycle < 20; cycle += 1) {
    fireEvent(input, 'focus', { nativeEvent: {} });
    expect(shell().props.collapsable).toBe(false);
    expect(screen.getByTestId('focus-password')).toBe(input);
    fireEvent(input, 'blur', { nativeEvent: {} });
    expect(shell().props.collapsable).toBe(false);
  }
  expect(input.props.value).toBe('Fixture-Only-123');
  expect(input.props.secureTextEntry).toBe(true);
});

test('focus and blur callbacks remain forwarded without extra callbacks', () => {
  const onFocus = jest.fn();
  const onBlur = jest.fn();
  render(<Harness onFocus={onFocus} onBlur={onBlur} />);
  const input = screen.getByTestId('focus-password');
  fireEvent(input, 'focus', { nativeEvent: {} });
  expect(onFocus).toHaveBeenCalledTimes(1);
  expect(onBlur).not.toHaveBeenCalled();
  fireEvent(input, 'blur', { nativeEvent: {} });
  expect(onBlur).toHaveBeenCalledTimes(1);
});
