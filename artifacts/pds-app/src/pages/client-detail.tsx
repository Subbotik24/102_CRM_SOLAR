import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, ArrowLeft, Plus, Loader2, User, Mail, Phone, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json();
}

interface Client {
  id: string; name: string; website: string | null; industry: string | null;
  internalNote?: string | null; archivedAt: string | null; createdAt: string;
}
interface Contact {
  id: string; clientId: string; firstName: string; lastName: string | null;
  email: string | null; phone: string | null; position: string | null;
  archivedAt: string | null; createdAt: string;
}

export default function ClientDetailPage() {
  const { t } = useTranslation('common');
  const [, params] = useRoute('/clients/:id');
  const id = params?.id ?? '';
  const queryClient = useQueryClient();

  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { data: client, isLoading: clientLoading } = useQuery<Client>({
    queryKey: ['clients', id],
    queryFn: () => apiFetch(`/api/clients/${id}`),
    enabled: !!id,
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery<{ contacts: Contact[] }>({
    queryKey: ['clients', id, 'contacts'],
    queryFn: () => apiFetch(`/api/clients/${id}/contacts`),
    enabled: !!id,
  });

  const createContactMutation = useMutation({
    mutationFn: (payload: { firstName: string; lastName?: string; email?: string; phone?: string; position?: string }) =>
      apiFetch<Contact>(`/api/clients/${id}/contacts`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', id, 'contacts'] });
      setContactDialogOpen(false);
      setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setPosition(''); setErrorMsg('');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const isLoading = clientLoading || contactsLoading;
  const contacts = contactsData?.contacts ?? [];

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex-1 p-6 md:p-10">
        <Link href="/clients">
          <Button variant="ghost" size="sm" className="gap-1 mb-4">
            <ArrowLeft className="h-4 w-4" />{t('clients.pageTitle')}
          </Button>
        </Link>
        <p className="text-muted-foreground">{t('clients.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-10 space-y-8">
      <div>
        <Link href="/clients">
          <Button variant="ghost" size="sm" className="gap-1 mb-3 -ml-2">
            <ArrowLeft className="h-4 w-4" />{t('clients.pageTitle')}
          </Button>
        </Link>
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary/10 p-3">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{client.name}</h1>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
              {client.industry && <span>{client.industry}</span>}
              {client.website && <a href={client.website} target="_blank" rel="noreferrer" className="hover:text-primary">{client.website}</a>}
            </div>
          </div>
        </div>
      </div>

      {/* Contacts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">{t('clients.contacts.title')}</h2>
          <Button size="sm" onClick={() => setContactDialogOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" />{t('clients.contacts.addContact')}
          </Button>
        </div>

        {contacts.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center space-y-2">
            <User className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
            <p className="text-muted-foreground text-sm">{t('clients.contacts.noContacts')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{c.firstName} {c.lastName}</p>
                    {c.position && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Briefcase className="h-3 w-3" />{c.position}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-1.5">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                          <Mail className="h-3 w-3" />{c.email}
                        </a>
                      )}
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                          <Phone className="h-3 w-3" />{c.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('clients.contacts.addContact')}</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!firstName.trim()) return;
              createContactMutation.mutate({
                firstName: firstName.trim(),
                lastName: lastName.trim() || undefined,
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
                position: position.trim() || undefined,
              });
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('clients.contacts.fields.firstName')}</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t('clients.contacts.fields.firstNamePlaceholder')} autoFocus required />
              </div>
              <div className="space-y-2">
                <Label>{t('clients.contacts.fields.lastName')}</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)}
                  placeholder={t('clients.contacts.fields.lastNamePlaceholder')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('clients.contacts.fields.position')}</Label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)}
                placeholder={t('clients.contacts.fields.positionPlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('clients.contacts.fields.email')}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('clients.contacts.fields.emailPlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('clients.contacts.fields.phone')}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder={t('clients.contacts.fields.phonePlaceholder')} />
            </div>
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContactDialogOpen(false)}>{t('actions.cancel')}</Button>
              <Button type="submit" disabled={createContactMutation.isPending || !firstName.trim()}>
                {createContactMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{t('actions.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
