import React, { useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { PasswordField } from '../components/PasswordField';

function Harness({ editable = true }: { editable?: boolean }) {
  const [value, setValue] = useState('');
  return <PasswordField label="New password" testID="password" value={value} onChangeText={setValue} editable={editable} />;
}
test('real controlled component accepts typing and editing without remounts', async () => {
  render(<Harness />);
  const input = screen.getByTestId('password');
  await userEvent.type(input, 'Fixture-Only-123', { skipBlur: true });
  expect(screen.getByTestId('password').props.value).toBe('Fixture-Only-123');
  fireEvent.changeText(input, 'Fixture-Only-12');
  expect(screen.getByTestId('password')).toBe(input);
  expect(input.props.value).toBe('Fixture-Only-12');
});
test('pasted spaces, Unicode, deletion, and clearing remain exact', () => {
  render(<Harness />);
  const input = screen.getByTestId('password');
  for (const value of ['  É🔐Fixture-Only-123  ', 'É', '']) {
    fireEvent.changeText(input, value);
    expect(input.props.value).toBe(value);
  }
});
test('show/hide never changes the password or remounts the input', () => {
  render(<Harness />);
  const input = screen.getByTestId('password');
  fireEvent.changeText(input, 'Fixture-Only-123');
  for (let index = 0; index < 20; index += 1) {
    fireEvent.press(screen.getByTestId('password-visibility'));
    expect(screen.getByTestId('password')).toBe(input);
    expect(input.props.value).toBe('Fixture-Only-123');
    expect(input.props.secureTextEntry).toBe(index % 2 !== 0);
  }
});
test('manual-entry defaults do not suppress typing or paste', () => {
  render(<Harness />);
  const props = screen.getByTestId('password').props;
  expect(props).toMatchObject({ secureTextEntry: true, multiline: false, clearTextOnFocus: false, contextMenuHidden: false, autoCapitalize: 'none', autoCorrect: false, autoComplete: 'off', textContentType: 'none', keyboardType: 'default', inputMode: 'text', importantForAutofill: 'no' });
  expect(props.passwordRules).toBeUndefined();
  expect(screen.getByTestId('password-visibility').props.hitSlop).toBeUndefined();
});
test('backgrounding the app hides a revealed password', () => {
  let listener: ((state: AppStateStatus) => void) | undefined;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => { listener = callback; return { remove }; });
  const result = render(<Harness />);
  fireEvent.changeText(screen.getByTestId('password'), 'Fixture-Only-123');
  fireEvent.press(screen.getByTestId('password-visibility'));
  act(() => listener?.('inactive'));
  expect(screen.getByTestId('password').props.secureTextEntry).toBe(true);
  result.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
test('busy fields cannot reveal passwords and keep the entered value', () => {
  const view = render(<Harness />);
  fireEvent.changeText(screen.getByTestId('password'), 'Fixture-Only-123');
  fireEvent.press(screen.getByTestId('password-visibility'));
  view.rerender(<Harness editable={false} />);
  expect(screen.getByTestId('password').props.secureTextEntry).toBe(true);
  expect(screen.getByTestId('password').props.value).toBe('Fixture-Only-123');
  expect(screen.getByTestId('password-visibility')).toBeDisabled();
});
