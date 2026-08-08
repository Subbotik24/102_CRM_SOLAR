import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { APP_NAME } from "@/lib/branding";
import { BrandLogo } from "@/components/brand-logo";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type LoginFormValues = { email: string; password: string };

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const loginSchema = z.object({
    email: z.string().email({ message: t("login.invalidEmail") }),
    password: z.string().min(1, { message: t("login.passwordRequired") }),
  });

  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setLocation("/");
        },
        onError: (error) => {
          toast({
            title: t("login.failed"),
            description: error.data?.error ?? t("login.failedDescription"),
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-[400px]">
        {/* Logo/Brand */}
        <div className="mb-10 text-center space-y-2">
          <BrandLogo compact className="mb-2 rounded-xl border border-primary/20 bg-primary/10 p-3 shadow-sm shadow-primary/10" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
        </div>

        {/* Login Form */}
        <div className="bg-card border shadow-sm rounded-xl p-6 sm:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        {t("login.emailField")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("login.emailFieldPlaceholder")}
                          type="email"
                          autoComplete="email"
                          className="font-mono text-sm"
                          data-testid="input-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        {t("login.passwordLabel")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={t("login.passwordPlaceholder")}
                          autoComplete="current-password"
                          className="font-mono text-sm tracking-widest placeholder:tracking-normal"
                          data-testid="input-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                className="w-full font-mono text-sm font-bold tracking-tight uppercase"
                disabled={loginMutation.isPending}
                data-testid="button-submit-login"
              >
                {loginMutation.isPending ? t("login.authenticating") : t("login.submitButton")}
              </Button>
            </form>
          </Form>
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground font-mono">
          <p>{t("login.systemProtected")}</p>
        </div>
      </div>
    </div>
  );
}
