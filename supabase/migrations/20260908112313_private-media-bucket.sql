-- Originals are private. Only the authenticated gateway signs read access.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('scheduly-media','scheduly-media',false,20000000,ARRAY['image/jpeg','image/png','image/webp','video/mp4'])
ON CONFLICT (id) DO NOTHING;
