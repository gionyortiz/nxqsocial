import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiRequest, PostItem } from '@/lib/api';
import { colors } from '@/lib/theme';
import { KeyboardDoneBar, useComposerKeyboard } from './KeyboardDoneBar';

type Comment = { id: string; content: string; user: { username: string; profile?: { displayName?: string } } };

// Mount with key={post.id}; a failed request keeps the draft, and a double tap sends only once.
export function CommentComposer({ post, token, onClose, onPosted }: {
  post: PostItem; token: string | null; onClose: () => void; onPosted: () => void;
}) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const mounted = useRef(true);
  const merge = (existing: Comment[], next: Comment[]) => [...new Map([...existing, ...next].map(item => [item.id, item])).values()];
  const load = async (nextCursor?: string) => {
    if (!token || loadingRef.current) return;
    loadingRef.current = true; setLoading(true); setLoadError(null);
    try {
      const page = await apiRequest<{ data: Comment[]; nextCursor?: string | null }>(`/posts/${post.id}/comments${nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ''}`, { token });
      if (!mounted.current) return;
      setComments(previous => merge(previous, page.data || []));
      setCursor(page.nextCursor || null);
    } catch (e) { if (mounted.current) setLoadError(e instanceof Error ? e.message : 'Could not load comments.'); }
    finally { loadingRef.current = false; if (mounted.current) setLoading(false); }
  };
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [post.id, token]);
  const keyboard = useComposerKeyboard();
  const close = () => { if (!sending.current) { keyboard.dismiss(); onClose(); } };
  const submit = async () => {
    if (!token || !content.trim() || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    keyboard.dismiss();
    try {
      const comment = await apiRequest<Comment>(`/posts/${post.id}/comments`, { method: 'POST', token, body: { content: content.trim() } });
      if (!mounted.current) return;
      setComments(previous => merge(previous, [comment]));
      setContent('');
      onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post your comment. Please try again.');
    } finally { sending.current = false; setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close comment" disabled={busy} onPress={close} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '80%' }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 10 }} />
          <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Comments</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel comment" disabled={busy} onPress={close} style={{ minHeight: 48, justifyContent: 'center' }}>
              <Text style={{ color: colors.muted }}>Close</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
            {comments.map(comment => <View key={comment.id} style={{ paddingVertical: 8, gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontWeight: '800' }}>{comment.user.profile?.displayName || comment.user.username} <Text style={{ color: colors.muted, fontWeight: '400' }}>@{comment.user.username}</Text></Text>
              <Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{comment.content}</Text>
            </View>)}
            {!loading && !loadError && comments.length === 0 ? <Text style={{ color: colors.muted, paddingVertical: 20 }}>Start the conversation. Be the first to comment.</Text> : null}
            {loading ? <ActivityIndicator accessibilityLabel="Loading comments" color={colors.accent} /> : null}
            {loadError ? <Text accessibilityRole="alert" style={{ color: '#fca5a5' }}>{loadError}</Text> : null}
            {(cursor || loadError) && !loading ? <Pressable accessibilityRole="button" onPress={() => void load(cursor || undefined)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent }}>{loadError ? 'Retry loading comments' : 'Load more comments'}</Text></Pressable> : null}
          </ScrollView>
          <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ color: colors.muted }}>Reply to @{post.author.username}</Text>
            <TextInput ref={keyboard.inputRef} onFocus={keyboard.onFocus} onBlur={keyboard.onBlur} value={content} onChangeText={setContent}
              editable={!busy} multiline maxLength={2000} placeholder="Write a comment…" accessibilityLabel="Comment" placeholderTextColor={colors.muted}
              style={{ color: colors.text, backgroundColor: colors.raised, borderRadius: 16, padding: 12, minHeight: 54, maxHeight: 110, textAlignVertical: 'top', fontSize: 16 }} />
            {error ? <Text accessibilityRole="alert" style={{ color: '#fca5a5' }}>{error}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={busy || !content.trim()} onPress={submit}
              style={{ minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: busy || !content.trim() ? 0.5 : 1 }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Post comment</Text>}
            </Pressable>
          </View>
          <KeyboardDoneBar visible={keyboard.visible} onDone={keyboard.dismiss} />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
