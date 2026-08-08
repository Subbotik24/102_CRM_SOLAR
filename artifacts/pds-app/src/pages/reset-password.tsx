import { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { ApiError, useResetPassword } from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { APP_NAME } from '@/lib/branding';

export default function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const resetPassword = useResetPassword({ mutation: {
    onSuccess: () => setDone(true),
    onError: (err: ApiError) => setError(err.message || t('reset.failed')),
  } });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(t('reset.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('reset.passwordMismatch'));
      return;
    }

    resetPassword.mutate({ data: { token, newPassword: password } });
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="text-center space-y-3">
          <p className="text-destructive font-medium" role="alert">{t('reset.invalidLink')}</p>
          <Button variant="link" onClick={() => navigate('/login')}>{t('reset.backToLogin')}</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" aria-hidden="true" />
          <p className="font-medium">{t('reset.success')}</p>
          <Button onClick={() => navigate('/login')}>{t('reset.login')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center space-y-2">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('reset.title')}</h1>
          <p className="text-sm text-muted-foreground">{APP_NAME} · {t('reset.subtitle')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border bg-card p-6 shadow-sm sm:p-8"
          data-testid="reset-password-form"
        >
          <div>
            <label htmlFor="new-password" className="text-sm font-medium mb-1.5 block">
              {t('reset.newPassword')}
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="input-new-password"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="text-sm font-medium mb-1.5 block">
              {t('reset.confirmPassword')}
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              data-testid="input-confirm-password"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert" data-testid="reset-password-error">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={resetPassword.isPending} data-testid="button-reset-password">
            {resetPassword.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : null}
            {resetPassword.isPending ? t('reset.submitting') : t('reset.submit')}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Button variant="link" onClick={() => navigate('/login')}>{t('reset.backToLogin')}</Button>
        </div>
      </div>
    </div>
  );
}
