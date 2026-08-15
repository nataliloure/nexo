-- Nexo security hardening snapshot.
-- Assumes public.nexo_records already exists.

revoke truncate, references, trigger, update on table public.nexo_records from authenticated;

grant select, insert, delete on table public.nexo_records to authenticated;

alter table public.nexo_records
  drop constraint if exists nexo_records_record_type_check,
  add constraint nexo_records_record_type_check
    check (record_type in ('checkin','relation','reflection','experiment','value','review')),
  drop constraint if exists nexo_records_payload_size_check,
  add constraint nexo_records_payload_size_check
    check (octet_length(payload::text) <= 100000),
  drop constraint if exists nexo_records_payload_object_check,
  add constraint nexo_records_payload_object_check
    check (jsonb_typeof(payload) = 'object');

drop policy if exists nexo_update_own on public.nexo_records;

drop policy if exists nexo_permanent_users_only on public.nexo_records;
create policy nexo_permanent_users_only
on public.nexo_records
as restrictive
for all
to authenticated
using ((select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)) = false)
with check ((select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)) = false);
