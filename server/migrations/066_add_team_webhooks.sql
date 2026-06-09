-- Incoming Slack / Teams webhook URLs per team. Notifications matching
-- a team (sentiment_spike, post_pending_approval) post a message to
-- the configured webhook in parallel with the bell + email.
--
-- Slack webhooks: https://api.slack.com/messaging/webhooks
-- Teams webhooks: https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook
-- Same JSON-shaped POST works for both (Slack ignores Teams's extra
-- fields; Teams parses Slack's "text"). We just call it slack_webhook.
ALTER TABLE teams
  ADD COLUMN slack_webhook_url VARCHAR(500) NULL AFTER name;
