-- Loppusiivous.fi — advisor-korjaukset
-- 1) set_updated_at: kiinnitä search_path (function_search_path_mutable)
-- 2) is_admin: estä anon-suoritus (SECURITY DEFINER ei saa olla anonin kutsuttavissa)

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
