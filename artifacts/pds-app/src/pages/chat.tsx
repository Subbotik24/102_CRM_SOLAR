import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare, Plus, Send, ArrowLeft, Users, Loader2, CornerDownRight, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

async function apiFetch<T = void>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as unknown as T;
  }
  return res.json();
}

interface Conversation {
  id: string; kind: 'direct' | 'project'; title: string | null;
  projectId: string | null; createdById: string; createdAt: string; updatedAt: string;
}

interface Message {
  id: string; conversationId: string; authorId: string; authorDisplayName: string | null;
  bodyMd: string; replyToId: string | null; editedAt: string | null;
  deletedAt: string | null; createdAt: string;
}

interface MentionUser { id: string; username: string | null; displayName: string; }

function MentionAutocomplete({
  query,
  onSelect,
}: { query: string; onSelect: (u: MentionUser) => void }) {
  const { data } = useQuery<{ users: MentionUser[] }>({
    queryKey: ['mention-search', query],
    queryFn: () => apiFetch(`/api/users/mention-search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
    staleTime: 10_000,
  });

  const users = data?.users ?? [];
  if (users.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-60 rounded-lg border bg-popover shadow-lg z-50 overflow-hidden">
      {users.map((u) => (
        <button
          key={u.id}
          onMouseDown={(e) => { e.preventDefault(); onSelect(u); }}
          className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2"
        >
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
            {u.displayName[0]}
          </div>
          <div>
            <p className="font-medium">{u.displayName}</p>
            {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
          </div>
        </button>
      ))}
    </div>
  );
}

function MessageInput({
  onSend, disabled, replyTo, onCancelReply,
}: {
  onSend: (body: string, replyToId?: string) => void;
  disabled?: boolean;
  replyTo?: Message | null;
  onCancelReply?: () => void;
}) {
  const { t: tc } = useTranslation('chat');
  const [body, setBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);
    autoResize();
    // Detect @mention at cursor
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w*)$/);
    setMentionQuery(match ? match[1] : '');
  }

  function handleMentionSelect(u: MentionUser) {
    const cursor = textareaRef.current?.selectionStart ?? body.length;
    const before = body.slice(0, cursor);
    const after = body.slice(cursor);
    const newBefore = before.replace(/@\w*$/, `@${u.username ?? u.displayName} `);
    setBody(newBefore + after);
    setMentionQuery('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !mentionQuery) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    if (!body.trim()) return;
    onSend(body.trim(), replyTo?.id);
    setBody('');
    setMentionQuery('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  return (
    <div className="border-t bg-background px-4 py-3 shrink-0">
      {replyTo && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 mb-2">
          <CornerDownRight className="h-3 w-3 shrink-0" />
          <span className="truncate flex-1">{replyTo.bodyMd.slice(0, 60)}</span>
          <button onClick={onCancelReply} className="hover:text-foreground shrink-0">×</button>
        </div>
      )}
      <div className="relative flex gap-2 items-end w-full">
        <div className="flex-1 min-w-0 relative">
          {mentionQuery !== '' && (
            <MentionAutocomplete query={mentionQuery} onSelect={handleMentionSelect} />
          )}
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={tc('typingPlaceholderFull')}
            rows={1}
            className="resize-none text-sm w-full min-h-[38px] max-h-32 overflow-y-auto"
            disabled={disabled}
          />
        </div>
        <Button size="icon" onClick={submit} disabled={disabled || !body.trim()} className="shrink-0 h-9 w-9 self-end">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ConversationView({
  conv,
  currentUserId,
  onBack,
}: {
  conv: Conversation;
  currentUserId: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(true);

  const qKey = ['messages', conv.id];

  const { data, isLoading } = useQuery<{ messages: Message[] }>({
    queryKey: qKey,
    queryFn: () => apiFetch(`/api/conversations/${conv.id}/messages`),
    refetchInterval: isFocused ? 10_000 : 60_000,
  });

  const messages = data?.messages ?? [];
  const lastMessageId = messages.at(-1)?.id;

  // Mark read when last message changes
  useEffect(() => {
    if (!lastMessageId) return;
    apiFetch(`/api/conversations/${conv.id}/mark-read`, {
      method: 'POST',
      body: JSON.stringify({ messageId: lastMessageId }),
    }).catch(() => null);
  }, [conv.id, lastMessageId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Track window focus to switch between 10s and 60s polling
  useEffect(() => {
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);
    const onVisible = () => setIsFocused(document.visibilityState === 'visible');
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const sendMut = useMutation({
    mutationFn: ({ body, replyToId }: { body: string; replyToId?: string }) =>
      apiFetch<Message>(`/api/conversations/${conv.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ bodyMd: body, replyToId }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); setReplyTo(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/messages/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  });

  const { t: tc } = useTranslation('chat');
  const convTitle = conv.kind === 'direct' ? tc('directMessageTitle') : (conv.title ?? tc('conversationTitle'));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b bg-background shrink-0">
        <button onClick={onBack} className="md:hidden p-1 rounded hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{convTitle}</p>
          <p className="text-xs text-muted-foreground capitalize">{conv.kind}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-30" />
            <p className="text-sm">{tc('noMessages')}</p>
          </div>
        ) : (
          messages.map((m) => {
            const isOwn = m.authorId === currentUserId;
            return (
              <div key={m.id} className={cn("flex flex-col gap-0.5", isOwn && "items-end")}>
                {!isOwn && m.authorDisplayName && (
                  <span className="text-[11px] text-muted-foreground font-medium px-1">{m.authorDisplayName}</span>
                )}
                <div className={cn("flex gap-2 w-full", isOwn ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm group relative",
                  isOwn
                    ? "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100 rounded-tr-sm"
                    : "bg-muted rounded-tl-sm"
                )}>
                  {m.replyToId && (
                    <div className={cn(
                      "text-xs opacity-60 border-l-2 pl-2 mb-1 truncate",
                      isOwn ? "border-sky-900/30 dark:border-sky-100/30" : "border-muted-foreground/40"
                    )}>
                      ↩ {tc('reply')}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.bodyMd}</p>
                  <div className={cn(
                    "text-[10px] mt-1 opacity-60 flex items-center gap-1",
                    isOwn ? "justify-end" : "justify-start"
                  )}>
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {m.editedAt && <span>({tc('edited')})</span>}
                  </div>

                  {/* Hover actions */}
                  <div className={cn(
                    "absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1",
                    isOwn ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"
                  )}>
                    <button
                      onClick={() => setReplyTo(m)}
                      className="p-1 rounded bg-background border shadow-sm hover:bg-accent text-muted-foreground"
                      title={tc('reply')}
                    >
                      <CornerDownRight className="h-3 w-3" />
                    </button>
                    {isOwn && (
                      <button
                        onClick={() => deleteMut.mutate(m.id)}
                        className="p-1 rounded bg-background border shadow-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title={tc('delete')}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSend={(body, replyToId) => sendMut.mutate({ body, replyToId })}
        disabled={sendMut.isPending}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}

interface ChatPageProps { params?: { id?: string } }

export default function ChatPage({ params }: ChatPageProps) {
  const { t: tc } = useTranslation('chat');
  const [selectedId, setSelectedId] = useState<string | null>(params?.id ?? null);
  const [newDirectOpen, setNewDirectOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [otherUserId, setOtherUserId] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupProjectId, setGroupProjectId] = useState('');
  const qc = useQueryClient();

  const { data: meData } = useQuery<{ id: string; displayName: string }>({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/auth/me'),
  });
  const currentUserId = meData?.id ?? '';

  const { data, isLoading } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ['conversations'],
    queryFn: () => apiFetch('/api/conversations'),
    refetchInterval: 30_000,
  });

  const { data: projectsData } = useQuery<{ projects: { id: string; name: string }[] }>({
    queryKey: ['projects'],
    queryFn: () => apiFetch('/api/projects'),
  });

  const conversations = data?.conversations ?? [];
  const projects = projectsData?.projects ?? [];

  const createDirect = useMutation({
    mutationFn: (otherUserId: string) =>
      apiFetch<Conversation>('/api/conversations/direct', {
        method: 'POST', body: JSON.stringify({ otherUserId }),
      }),
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setSelectedId(conv.id);
      setNewDirectOpen(false);
      setOtherUserId('');
    },
  });

  const createGroup = useMutation({
    mutationFn: ({ projectId, title }: { projectId: string; title: string }) =>
      apiFetch<Conversation>('/api/conversations/project', {
        method: 'POST', body: JSON.stringify({ projectId, title }),
      }),
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setSelectedId(conv.id);
      setNewGroupOpen(false);
      setGroupTitle('');
      setGroupProjectId('');
    },
  });

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="absolute inset-0 top-14 md:top-0 bottom-16 md:bottom-0 flex overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "w-full md:w-72 border-r flex flex-col shrink-0",
        selected ? "hidden md:flex" : "flex"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b shrink-0">
          <h1 className="font-semibold text-sm">{tc('messages')}</h1>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setNewDirectOpen(true)} title={tc('newDirectMessage')}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setNewGroupOpen(true)} title={tc('newGroup')}>
              <Users className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
              <p className="text-sm text-muted-foreground">{tc('noConversations')}</p>
              <Button size="sm" variant="outline" onClick={() => setNewDirectOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />{tc('startOne')}
              </Button>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors",
                  selectedId === c.id && "bg-accent"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {c.kind === 'direct'
                      ? <MessageSquare className="h-4 w-4 text-primary" />
                      : <Users className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {c.kind === 'direct' ? tc('directMessageTitle') : (c.title ?? tc('conversationTitle'))}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{c.kind}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className={cn("flex-1 min-w-0", !selected && "hidden md:flex items-center justify-center")}>
        {selected ? (
          <ConversationView
            conv={selected}
            currentUserId={currentUserId}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="text-center text-muted-foreground space-y-2">
            <MessageSquare className="h-10 w-10 mx-auto opacity-20" />
            <p className="text-sm">{tc('selectConversation')}</p>
          </div>
        )}
      </div>

      {/* New direct dialog */}
      <Dialog open={newDirectOpen} onOpenChange={setNewDirectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tc('newDirectMessage')}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (otherUserId.trim()) createDirect.mutate(otherUserId.trim()); }} className="space-y-4">
            <div className="space-y-2">
              <Label>{tc('userId')}</Label>
              <Input value={otherUserId} onChange={(e) => setOtherUserId(e.target.value)} placeholder={tc('userIdPlaceholder')} autoFocus required />
              <p className="text-xs text-muted-foreground">{tc('userIdHint')}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewDirectOpen(false)}>{tc('cancel', {ns:'common', defaultValue:'Cancel'})}</Button>
              <Button type="submit" disabled={createDirect.isPending || !otherUserId.trim()}>
                {createDirect.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{tc('start')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New group dialog */}
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tc('newProjectConversation')}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (groupTitle.trim() && groupProjectId) createGroup.mutate({ projectId: groupProjectId, title: groupTitle.trim() });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>{tc('projectLabel')}</Label>
              <select
                value={groupProjectId}
                onChange={(e) => setGroupProjectId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">{tc('selectProject')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{tc('title')}</Label>
              <Input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder={tc('titlePlaceholder')} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewGroupOpen(false)}>{tc('cancel', {ns:'common', defaultValue:'Cancel'})}</Button>
              <Button type="submit" disabled={createGroup.isPending || !groupTitle.trim() || !groupProjectId}>
                {createGroup.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{tc('create', {ns:'common', defaultValue:'Create'})}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
