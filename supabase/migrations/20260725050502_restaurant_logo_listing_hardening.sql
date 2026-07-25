-- V585: public bucket URLs do not require a broad SELECT policy.
-- Logos remain renderable while anonymous clients cannot list the whole bucket.

drop policy if exists "restaurant logos are publicly readable" on storage.objects;
