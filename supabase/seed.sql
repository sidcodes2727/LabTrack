insert into users (name, email, password_hash, role)
values
  ('Admin User', 'admin@labtrack.edu', '$2a$10$W2QvDuLk8pUu1kxshvN6Aejf8yz6BypF31MikfBfXUZ5EONosFVh.', 'admin'),
  ('Student User', 'student@labtrack.edu', '$2a$10$W2QvDuLk8pUu1kxshvN6Aejf8yz6BypF31MikfBfXUZ5EONosFVh.', 'student')
on conflict (email) do nothing;

truncate table history, complaints, assets restart identity cascade;

do $$
declare
  i int := 0;
  r int;
  p int;
  st asset_status;
  lab_name text;
  sec text;
  sys_id text;
  orig_id text;
  aid uuid;
begin
  for sec in select unnest(array['2A','2B','2C']) loop
    for r in 1..2 loop
      for p in 1..9 loop
        i := i + 1;
        if i <= 83 then st := 'working';
        elsif i <= 106 then st := 'faulty';
        else st := 'maintenance';
        end if;

        sys_id := format('LAB2-%s-PC-%s', sec, lpad(((r - 1) * 9 + p)::text, 2, '0'));
        orig_id := format(
          'VJTI/IT-Infra/May-22/AIO/701/CEOTI/3/37/53/70-%s-R%s-P%s',
          sec,
          r,
          lpad(p::text, 2, '0')
        );

        insert into assets(system_id, original_id, lab, section, row_num, position, status, cpu, ram, purchase_date, last_maintenance)
        values (sys_id, orig_id, 'LAB 2', sec, r, p, st, 'Intel i5 12th Gen', '16GB', date '2022-05-10' + (i % 70), date '2025-01-10' + (i % 90))
        returning id into aid;

        insert into history(asset_id, event_type, details, event_date)
        values
          (aid, 'Purchase', 'Asset procured and registered in inventory', now() - interval '3 years'),
          (aid, 'Maintenance', 'Routine health check completed', now() - interval '30 days');
      end loop;
    end loop;
  end loop;

  for lab_name in select unnest(array['LAB 3A','LAB 3B']) loop
    for sec in select unnest(array['L','R']) loop
      for r in 1..4 loop
        for p in 1..4 loop
          i := i + 1;
          if i <= 83 then st := 'working';
          elsif i <= 106 then st := 'faulty';
          else st := 'maintenance';
          end if;

          sys_id := format('%s-%s-PC-%s', replace(lab_name, ' ', ''), sec, lpad(((r - 1) * 4 + p)::text, 2, '0'));
          orig_id := format(
            'VJTI/IT-Infra/May-22/AIO/702/CEOTI/3/37/53/80-%s-%s-R%s-P%s',
            replace(lab_name, ' ', ''),
            sec,
            r,
            lpad(p::text, 2, '0')
          );

          insert into assets(system_id, original_id, lab, section, row_num, position, status, cpu, ram, purchase_date, last_maintenance)
          values (sys_id, orig_id, lab_name, sec, r, p, st, 'Intel i7 12th Gen', '32GB', date '2022-07-01' + (i % 65), date '2025-02-01' + (i % 75))
          returning id into aid;

          insert into history(asset_id, event_type, details, event_date)
          values
            (aid, 'Purchase', 'Asset procured and registered in inventory', now() - interval '2 years 8 months'),
            (aid, 'Maintenance', 'Preventive maintenance completed', now() - interval '15 days');
        end loop;
      end loop;
    end loop;
  end loop;
end $$;

insert into notifications(title, message, role_target)
values
  ('System initialized', 'LabTrack seed data loaded successfully', 'admin'),
  ('Welcome', 'Use lab map to report issues quickly', 'student');

insert into complaints(asset_id, user_id, description, priority, ai_priority, status)
select
  a.id,
  (select id from users where role = 'student' limit 1),
  'Boot delay and random restart observed in morning session',
  'High',
  'High',
  'pending'
from assets a
where a.status = 'faulty'
limit 3;
