-- 0022_ad_campaign_status.sql — campaign statuses for self-serve advertising.
--
-- 'pending': paid, awaiting editor approval. 'rejected': an editor declined it. Enum values cannot be
-- used in the transaction that adds them, so this stands alone and 0023 builds on it.

alter type public.ad_campaign_status add value if not exists 'pending';
alter type public.ad_campaign_status add value if not exists 'rejected';
