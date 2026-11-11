-- Private bucket for archived handwritten note pages (was created outside migrations).
INSERT INTO storage.buckets (id, name, public)
VALUES ('handwriting', 'handwriting', false)
ON CONFLICT (id) DO NOTHING;
