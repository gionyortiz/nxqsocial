import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

import { TURNSTILE_MOBILE_URL } from '@/lib/config';

export type TurnstileWidgetState = 'loading' | 'ready' | 'verified' | 'expired' | 'error';

type TurnstileWidgetProps = {
  resetKey: number;
  onTokenChange: (token: string | null) => void;
  onStateChange: (state: TurnstileWidgetState) => void;
};

type BridgeMessage =
  | { type: 'turnstile-ready' }
  | { type: 'turnstile-token'; token: string }
  | { type: 'turnstile-expired' }
  | { type: 'turnstile-error'; message: string };

const CHALLENGE_ORIGIN = 'https://challenges.cloudflare.com';

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const configuredWidgetUrl = parseUrl(TURNSTILE_MOBILE_URL);
const EXPECTED_ORIGIN = configuredWidgetUrl?.origin ?? '';
const EXPECTED_PATH = configuredWidgetUrl?.pathname.replace(/\/$/, '') ?? '';

function isExpectedWidgetPage(value: string): boolean {
  const url = parseUrl(value);
  if (!url) return false;
  return url.origin === EXPECTED_ORIGIN
    && url.pathname.replace(/\/$/, '') === EXPECTED_PATH
    && !url.search
    && !url.hash;
}

function isAllowedNavigation(value: string): boolean {
  if (value === 'about:blank' || value === 'about:srcdoc') return true;
  if (isExpectedWidgetPage(value)) return true;
  const url = parseUrl(value);
  return url?.protocol === 'https:' && url.origin === CHALLENGE_ORIGIN;
}

function parseBridgeMessage(raw: string): BridgeMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (record.type === 'turnstile-ready' && keys.length === 1 && keys[0] === 'type') {
    return { type: 'turnstile-ready' };
  }
  if (record.type === 'turnstile-expired' && keys.length === 1 && keys[0] === 'type') {
    return { type: 'turnstile-expired' };
  }
  if (
    record.type === 'turnstile-token'
    && keys.length === 2
    && keys[0] === 'token'
    && keys[1] === 'type'
    && typeof record.token === 'string'
  ) {
    const token = record.token.trim();
    if (token && token.length <= 2048) return { type: 'turnstile-token', token };
    return null;
  }
  if (
    record.type === 'turnstile-error'
    && keys.length === 2
    && keys[0] === 'message'
    && keys[1] === 'type'
    && typeof record.message === 'string'
  ) {
    return { type: 'turnstile-error', message: record.message };
  }
  return null;
}

export function TurnstileWidget({ resetKey, onTokenChange, onStateChange }: TurnstileWidgetProps) {
  const source = useMemo(() => ({ uri: TURNSTILE_MOBILE_URL }), []);

  const handleMessage = (event: WebViewMessageEvent) => {
    if (!isExpectedWidgetPage(event.nativeEvent.url)) return;
    const message = parseBridgeMessage(event.nativeEvent.data);
    if (!message) return;

    if (message.type === 'turnstile-token') {
      onTokenChange(message.token);
      onStateChange('verified');
      return;
    }
    if (message.type === 'turnstile-ready') {
      onTokenChange(null);
      onStateChange('ready');
      return;
    }

    onTokenChange(null);
    onStateChange(message.type === 'turnstile-expired' ? 'expired' : 'error');
  };

  const allowNavigation = (request: WebViewNavigation) => isAllowedNavigation(request.url);

  return (
    <View style={styles.container}>
      <WebView
        key={resetKey}
        source={source}
        originWhitelist={[EXPECTED_ORIGIN, CHALLENGE_ORIGIN, 'about:*'].filter(Boolean)}
        onShouldStartLoadWithRequest={allowNavigation}
        onMessage={handleMessage}
        onLoadStart={() => {
          onTokenChange(null);
          onStateChange('loading');
        }}
        onError={() => {
          onTokenChange(null);
          onStateChange('error');
        }}
        onHttpError={() => {
          onTokenChange(null);
          onStateChange('error');
        }}
        onContentProcessDidTerminate={() => {
          onTokenChange(null);
          onStateChange('error');
        }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        startInLoadingState
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 360,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#151d33',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
