-- SubTrack Initial PostgreSQL / Supabase Schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigger helper to keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Auto-provision profile on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 1. Profiles (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Account',
  default_currency text NOT NULL DEFAULT 'IDR',
  theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'system')),
  include_paused_in_estimates boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  category text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'IDR',
  billing_interval text NOT NULL CHECK (
    billing_interval IN ('weekly', 'monthly', 'quarterly', 'semi_annually', 'annually', 'custom')
  ),
  custom_interval_days integer CHECK (custom_interval_days IS NULL OR custom_interval_days > 0),
  start_date date NOT NULL,
  billing_day smallint NOT NULL CHECK (billing_day BETWEEN 1 AND 31),
  next_billing_date date NOT NULL,
  payment_method text,
  website_url text CHECK (website_url IS NULL OR website_url ~* '^https?://'),
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON public.subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_next_billing
  ON public.subscriptions (user_id, next_billing_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_category
  ON public.subscriptions (user_id, category);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Billing History
CREATE TABLE IF NOT EXISTS public.billing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'IDR',
  billed_at date NOT NULL,
  status text NOT NULL CHECK (status IN ('paid', 'skipped', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_history_sub_billed
  ON public.billing_history (subscription_id, billed_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_history_user_billed
  ON public.billing_history (user_id, billed_at DESC);

-- 4. Notification Preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  remind_7_days boolean NOT NULL DEFAULT true,
  remind_3_days boolean NOT NULL DEFAULT true,
  remind_1_day boolean NOT NULL DEFAULT true,
  remind_on_due_date boolean NOT NULL DEFAULT true,
  in_app_alerts_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row Level Security (User-Level Data Isolation)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage own subscriptions"
  ON public.subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own billing history"
  ON public.billing_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = subscription_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own notification preferences"
  ON public.notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
