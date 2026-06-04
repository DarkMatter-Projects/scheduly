-- Add 'twitter' (X) to the social_accounts.platform enum so we can store
-- X / Twitter accounts alongside FB / IG / LinkedIn / etc. The Twitter
-- overview template + posting flow refer to platform = 'twitter'.
ALTER TABLE social_accounts
  MODIFY COLUMN platform ENUM(
    'facebook_page',
    'instagram_business',
    'pinterest',
    'threads',
    'tiktok',
    'linkedin',
    'youtube',
    'twitter',
    'snapchat'
  ) NOT NULL;
