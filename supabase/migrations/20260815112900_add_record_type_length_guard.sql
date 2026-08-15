alter table public.nexo_records
  drop constraint if exists nexo_records_record_type_length_check,
  add constraint nexo_records_record_type_length_check
    check (char_length(record_type) <= 32);
