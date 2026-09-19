'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Phone, Plus, Send, Video } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { startCall } from '@/lib/calls';
import { useAuthStore } from '@/store/auth';
import { useCallStore } from '@/store/call';

interface MessageUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

interface DirectMessage {
  id: string;
  content: string;
  createdAt: string;
  sender: MessageUser;
}

interface Conversation {
  id: string;
  participant: MessageUser | null;
  lastMessage: DirectMessage | null;
  unreadCount: number;
  updatedAt: string;
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = error.response as { data?: { message?: string | string[] } };
    const message = response.data?.message;
    if (Array.isArray(message)) return message.join(' ');
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function conversationLabel(conversation: Conversation) {
  return conversation.participant?.displayName ?? 'Conversation';
}

function conversationPreview(conversation: Conversation) {
  return conversation.lastMessage?.content ?? 'No messages yet';
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function initialMessageRequest() {
  if (typeof window === 'undefined') return { username: '', conversation: '' };
  const parameters = new URLSearchParams(window.location.search);
  return {
    username: parameters.get('with')?.trim() ?? '',
    conversation: parameters.get('conversation')?.trim() ?? '',
  };
}

export default function MessagesPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const beginCall = useCallStore((state) => state.start);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [username, setUsername] = useState('');
  const [composer, setComposer] = useState('');
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [startingCall, setStartingCall] = useState<'voice' | 'video' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [initialRequest] = useState(initialMessageRequest);
  const handledDirectTarget = useRef<string | null>(null);

  const requestedUsername = initialRequest.username;
  const requestedConversation = initialRequest.conversation;
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await api.get('/messages/conversations');
      const next = Array.isArray(data?.data) ? data.data as Conversation[] : [];
      setConversations(next);
      setSelectedId((current) => {
        if (current && next.some((conversation) => conversation.id === current)) return current;
        if (requestedConversation && next.some((conversation) => conversation.id === requestedConversation)) {
          return requestedConversation;
        }
        return next[0]?.id ?? null;
      });
    } catch (error) {
      setNotice(errorMessage(error, 'Could not load conversations.'));
    } finally {
      setLoadingConversations(false);
    }
  }, [requestedConversation]);

  const loadMessages = useCallback(async (conversationId: string, quiet = false) => {
    if (!quiet) setLoadingMessages(true);
    try {
      const { data } = await api.get(`/messages/conversations/${encodeURIComponent(conversationId)}/messages`);
      setMessages(Array.isArray(data?.data) ? data.data as DirectMessage[] : []);
      void api.post(`/messages/conversations/${encodeURIComponent(conversationId)}/read`).catch(() => undefined);
    } catch (error) {
      if (!quiet) setNotice(errorMessage(error, 'Could not load this conversation.'));
    } finally {
      if (!quiet) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    const timeout = window.setTimeout(() => {
      void loadConversations();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadConversations, router, user]);

  useEffect(() => {
    if (!selectedId) return;
    const timeout = window.setTimeout(() => {
      void loadMessages(selectedId);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadMessages, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const interval = window.setInterval(() => {
      void loadMessages(selectedId, true);
      void loadConversations();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadConversations, loadMessages, selectedId]);

  const openConversation = useCallback(async (participantUsername: string) => {
    const target = participantUsername.trim().replace(/^@/, '');
    if (!target || creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const { data } = await api.post('/messages/conversations', { participantUsername: target });
      if (!data?.id || typeof data.id !== 'string') throw new Error('Conversation response was incomplete.');
      setSelectedId(data.id);
      setUsername('');
      router.replace(`/messages?conversation=${encodeURIComponent(data.id)}`);
      await loadConversations();
    } catch (error) {
      setNotice(errorMessage(error, 'Could not open a conversation with that user.'));
    } finally {
      setCreating(false);
    }
  }, [creating, loadConversations, router]);

  useEffect(() => {
    if (!user || !requestedUsername || handledDirectTarget.current === requestedUsername) return;
    handledDirectTarget.current = requestedUsername;
    void openConversation(requestedUsername);
  }, [openConversation, requestedUsername, user]);

  async function submitNewConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await openConversation(username);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = composer.trim();
    if (!selectedId || !content || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const { data } = await api.post(
        `/messages/conversations/${encodeURIComponent(selectedId)}/messages`,
        { content },
      );
      setMessages((current) => [...current, data as DirectMessage]);
      setComposer('');
      await loadConversations();
    } catch (error) {
      setNotice(errorMessage(error, 'Could not send your message.'));
    } finally {
      setSending(false);
    }
  }

  async function startConversationCall(callType: 'voice' | 'video') {
    const peer = selectedConversation?.participant;
    if (!peer || startingCall) return;
    setStartingCall(callType);
    setNotice(null);
    try {
      const room = await startCall({ targets: [peer.username], callType, group: false });
      beginCall(room, {
        video: callType === 'video',
        callType,
        peer: {
          username: peer.username,
          displayName: peer.displayName,
          avatarUrl: peer.avatarUrl,
        },
      });
      router.push('/feed');
    } catch (error) {
      setNotice(errorMessage(error, 'Calling is not available right now.'));
    } finally {
      setStartingCall(null);
    }
  }

  // Do not render a message shell to anonymous visitors, including while the
  // client is redirecting them to the sign-in route.
  if (!user) return null;

  return (
    <AppShell>
      <div className="px-3 py-4 sm:px-4">
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-600">Messages</p>
            <h1 className="mt-1 text-2xl font-black text-gray-900">Inbox</h1>
          </div>

          {notice && (
            <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {notice}
            </div>
          )}

          <div className="grid min-h-[560px] md:grid-cols-[minmax(230px,0.8fr)_minmax(0,1.4fr)]">
            <aside className="border-b border-gray-100 md:border-b-0 md:border-r">
              <form onSubmit={submitNewConversation} className="border-b border-gray-100 p-3">
                <label className="sr-only" htmlFor="message-username">Username</label>
                <div className="flex gap-2">
                  <input
                    id="message-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Message @username"
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                    maxLength={64}
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={creating || !username.trim()}
                    className="inline-flex items-center justify-center rounded-xl bg-purple-600 px-3 text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Open conversation"
                    aria-label="Open conversation"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </form>

              <div className="max-h-[280px] overflow-y-auto md:max-h-[490px]">
                {loadingConversations && <p className="px-4 py-6 text-sm text-gray-500">Loading conversations…</p>}
                {!loadingConversations && conversations.length === 0 && (
                  <div className="px-5 py-10 text-center">
                    <MessageCircle className="mx-auto mb-3 text-gray-300" size={28} />
                    <p className="text-sm font-semibold text-gray-700">No conversations yet</p>
                    <p className="mt-1 text-xs text-gray-500">Enter a username above to start one.</p>
                  </div>
                )}
                {conversations.map((conversation) => {
                  const selected = conversation.id === selectedId;
                  const peer = conversation.participant;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(conversation.id);
                        router.replace(`/messages?conversation=${encodeURIComponent(conversation.id)}`);
                      }}
                      className={`flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left transition ${
                        selected ? 'bg-purple-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <Avatar src={peer?.avatarUrl ?? null} alt={conversationLabel(conversation)} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-gray-900">{conversationLabel(conversation)}</span>
                          {conversation.unreadCount > 0 && (
                            <span className="rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {conversation.unreadCount}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-gray-500">{conversationPreview(conversation)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="flex min-h-[410px] flex-col">
              {!selectedConversation ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                  <MessageCircle className="mb-3 text-gray-300" size={32} />
                  <p className="font-semibold text-gray-700">Choose a conversation</p>
                  <p className="mt-1 text-sm text-gray-500">Or start one with an NXQ Social username.</p>
                </div>
              ) : (
                <>
                  <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                    <Avatar
                      src={selectedConversation.participant?.avatarUrl ?? null}
                      alt={conversationLabel(selectedConversation)}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900">{conversationLabel(selectedConversation)}</p>
                      {selectedConversation.participant && (
                        <p className="truncate text-xs text-gray-500">@{selectedConversation.participant.username}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void startConversationCall('voice')}
                      disabled={!selectedConversation.participant || startingCall !== null}
                      aria-label="Start audio call"
                      title="Start audio call"
                      className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Phone size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void startConversationCall('video')}
                      disabled={!selectedConversation.participant || startingCall !== null}
                      aria-label="Start video call"
                      title="Start video call"
                      className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Video size={18} />
                    </button>
                  </header>

                  <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50/50 px-4 py-4">
                    {loadingMessages && <p className="text-sm text-gray-500">Loading messages…</p>}
                    {!loadingMessages && messages.length === 0 && (
                      <p className="py-8 text-center text-sm text-gray-500">Send the first message.</p>
                    )}
                    {messages.map((message) => {
                      const mine = message.sender.id === user.id;
                      return (
                        <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                            mine ? 'bg-purple-600 text-white' : 'bg-white text-gray-900'
                          }`}>
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            <p className={`mt-1 text-[10px] ${mine ? 'text-purple-100' : 'text-gray-400'}`}>
                              {formatTime(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <form onSubmit={sendMessage} className="flex gap-2 border-t border-gray-100 p-3">
                    <label className="sr-only" htmlFor="message-composer">Message</label>
                    <textarea
                      id="message-composer"
                      value={composer}
                      onChange={(event) => setComposer(event.target.value)}
                      placeholder="Write a message…"
                      rows={1}
                      maxLength={2000}
                      className="min-h-10 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                    />
                    <button
                      type="submit"
                      disabled={sending || !composer.trim()}
                      className="inline-flex items-center justify-center self-end rounded-xl bg-purple-600 px-3 py-2 text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Send message"
                      title="Send message"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
