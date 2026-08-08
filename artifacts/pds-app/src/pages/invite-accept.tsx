/**
 * Accept invitation page — /invite/accept?token=<token>
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ApiError, useAcceptInvitation } from '@workspace/api-client-react';
import { UserPlus, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function InviteAcceptPage() {
  const { t } = useTranslation('auth');
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') ?? '';

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const acceptInvitation = useAcceptInvitation({ mutation: {
    onSuccess: () => { setDone(true); setTimeout(() => navigate('/'), 1500); },
    onError: (err: ApiError) => setError(err.message || t('invite.failed')),
  } });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-destructive font-medium">{t('invite.invalidLink')}</p>
          <button onClick={() => navigate('/login')} className="text-primary text-sm mt-2 underline">
            {t('invite.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError(t('invite.passwordMismatch')); return; }
    if (password.length < 8) { setError(t('invite.passwordTooShort')); return; }
    acceptInvitation.mutate({ data: { token, displayName, password } });
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <p className="font-medium">{t('invite.created')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <UserPlus className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">{t('invite.title')}</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('invite.displayName')}</label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={t('invite.displayNamePlaceholder')} required />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('invite.password')}</label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('invite.passwordPlaceholder')} required />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('invite.confirmPassword')}</label>
            <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={t('invite.confirmPasswordPlaceholder')} required />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={acceptInvitation.isPending}>
            {acceptInvitation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {t('invite.submit')}
          </Button>
        </form>
        <div className="mt-4 text-center">
          <button onClick={() => navigate('/login')} className="text-sm text-muted-foreground hover:underline">
            {t('invite.loginLink')}
          </button>
        </div>
      </div>
    </div>
  );
}
