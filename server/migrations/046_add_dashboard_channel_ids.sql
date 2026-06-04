-- Persist a dashboard-level "channels in scope" hint so the Custom
-- (and any other) dashboard can remember which accounts the user picked
-- in the template wizard. Widgets without their own channel_ids fall
-- back to this list before falling all the way through to "all
-- accessible accounts".
ALTER TABLE dashboards
  ADD COLUMN channel_ids JSON NULL AFTER client_id;
