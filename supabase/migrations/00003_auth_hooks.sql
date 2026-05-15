-- ============================================================
-- Auth Hooks: Auto-create profile on user signup
-- ============================================================

-- Auto-populate profiles when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer'),
    'active'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sync email changes from auth.users to profiles
CREATE OR REPLACE FUNCTION public.sync_user_email()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_user_email();

-- Updated_at trigger for profiles
CREATE OR REPLACE FUNCTION public.update_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_profile_timestamp();

-- Updated_at trigger for positions
CREATE OR REPLACE FUNCTION public.update_position_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION public.update_position_timestamp();

-- Updated_at trigger for agents
CREATE OR REPLACE FUNCTION public.update_agent_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION public.update_agent_timestamp();
