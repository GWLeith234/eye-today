-- 0030_legal_category_prescription.sql — Sprint 25a: the category the Legal Map was missing.
--
-- 0025 offered five categories: unregulated, permitted, decriminalised, prohibited, unclear. Scoping four
-- countries found that the most common real position in this field fits none of them. Canada is the clearest
-- case: on 19 May 2017 Health Canada put ibogaine on the Prescription Drug List under C.01.040.3 of the Food
-- and Drug Regulations — which is NOT the Controlled Drugs and Substances Act. A doctor may lawfully
-- prescribe it; selling or supplying it otherwise is unlawful; possessing it is not a drug offence. South
-- Africa, Australia and New Zealand sit in the same place.
--
-- Filing that as "permitted" overstates it and "unregulated" is simply wrong — that is what Mexico is. The
-- category drives the grouping on /legal-map, and the two questions a reader actually arrives with are "can
-- a doctor legally give me this here" and "is possessing it a crime". Prescription-only answers both
-- differently from every existing value, so it earns its own group rather than a footnote in a summary.
--
-- Nothing is reclassified here. Existing rows keep the category they have; an editor moves them.

alter table public.country_legal_status
  drop constraint if exists country_legal_status_legal_category_check;

alter table public.country_legal_status
  add constraint country_legal_status_legal_category_check
  check (legal_category in ('unregulated', 'permitted', 'prescription', 'decriminalised', 'prohibited', 'unclear'));
