-- Super admin: full control, including managing other admins. (Separate migration because
-- a new enum value cannot be used in the same transaction that adds it.)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
