create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.nexo_mfa_access_ok()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  with claims as (
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb as j
  ), identity as (
    select nullif(j->>'sub','')::uuid as user_id,
           coalesce(nullif(j->>'aal',''),'aal1') as aal
    from claims
  )
  select case
    when exists (
      select 1
      from auth.mfa_factors f, identity i
      where f.user_id = i.user_id
        and f.status = 'verified'
    )
    then (select aal = 'aal2' from identity)
    else (select aal in ('aal1','aal2') from identity)
  end;
$$;

revoke all on function private.nexo_mfa_access_ok() from public;
grant execute on function private.nexo_mfa_access_ok() to authenticated;

drop policy if exists nexo_require_mfa_when_enrolled on public.nexo_records;
create policy nexo_require_mfa_when_enrolled
  on public.nexo_records
  as restrictive
  to authenticated
  using ((select private.nexo_mfa_access_ok()));
