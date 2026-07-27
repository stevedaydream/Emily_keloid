-- Number the per-case keloid site list (部位1, 部位2, ...) and let a photo link to a specific site.
alter table public.case_keloid_lesions add column if not exists site_no integer;

with numbered as (
  select id, row_number() over (partition by case_id order by created_at, id) as rn
  from public.case_keloid_lesions
)
update public.case_keloid_lesions l
set site_no = n.rn
from numbered n
where n.id = l.id and l.site_no is null;

comment on column public.case_keloid_lesions.site_no is 'Sequential site number within the case (部位1,2,...); used to pick which site a photo is taken for.';

alter table public.photos add column if not exists lesion_id uuid references public.case_keloid_lesions(id) on delete set null;
comment on column public.photos.lesion_id is 'The case site (case_keloid_lesions) this photo was taken for, when chosen from the case site list.';
create index if not exists idx_photos_lesion_id on public.photos(lesion_id);
