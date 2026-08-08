import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  const { t } = useTranslation('common');
  return (
    <div className="flex-1 w-full flex items-center justify-center p-6 bg-background text-foreground h-full min-h-[50vh]">
      <Card className="w-full max-w-md mx-4 shadow-sm border">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold font-mono tracking-tight">
              {t('notFound.title')}
            </h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {t('notFound.message')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
