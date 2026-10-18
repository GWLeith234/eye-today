-- Legal Map: Canada. Run AFTER migration 0030 adds 'prescription' to legal_category (Sprint 25a).
--
-- Held back from production deliberately. The entry is verified from Health Canada's own notice, but the
-- category it needs does not exist yet: the check constraint from 0025 offers only unregulated, permitted,
-- decriminalised, prohibited and unclear, and Canada is none of those. Filing it as "permitted" would
-- overstate the position and "unregulated" is what Mexico is. A true entry under a false label is worse than
-- no entry, so this waits for the migration.

insert into public.country_legal_status (site_id, country_code, title, summary_html, sources, as_of, legal_category, status)
select s.id, 'CA', 'Canada',
'<p>Ibogaine is a <strong>prescription drug</strong> in Canada, not a scheduled narcotic. On 19 May 2017 Health Canada added &ldquo;ibogaine and its salts, derivatives or analogues&rdquo; to the Human and Veterinary Prescription Drug List, under the criteria in section C.01.040.3 of the Food and Drug Regulations. The addition took effect at the time of posting.</p><p>The practical difference from the United States is large and widely missed. Being on the Prescription Drug List is not the same as being scheduled under the Controlled Drugs and Substances Act: ibogaine is not a controlled substance in Canada. It may lawfully be prescribed by a practitioner, and it may not lawfully be sold or supplied without a prescription.</p><p>No ibogaine product has been authorised for sale in Canada, so there is no approved product for a prescriber to dispense. In practice access runs through clinical trials, Health Canada&rsquo;s Special Access Programme, or treatment abroad.</p><p><strong>Can a doctor legally give me this in Canada?</strong> Only through an authorised route: there is no marketed product to prescribe. <strong>Is possessing it a crime?</strong> It is not a controlled substance, so simple possession is not a drug offence; selling or supplying it without a prescription breaches the Food and Drugs Act.</p>',
'[{"title":"Notice — Prescription Drug List (PDL): Multiple additions","publisher":"Health Canada","url":"https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/prescription-drug-list/notice-prescription-drug-list-multiple-additions-2.html","date":"2017-05-19"},{"title":"About the Prescription Drug List","publisher":"Health Canada","url":"https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/prescription-drug-list.html"}]'::jsonb,
'2026-10-17', 'prescription', 'draft'
  from public.sites s where s.slug = 'eyetoday'
on conflict (site_id, country_code) do nothing;

select country_code, legal_category, status, as_of, jsonb_array_length(sources) as sources
  from public.country_legal_status order by country_code;
