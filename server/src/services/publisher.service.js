const pool = require('../config/db');
const { publishToPage } = require('./facebook.service');
const { publishToInstagram } = require('./instagram.service');
const { publishToTikTok } = require('./tiktok_posting.service');
const { publishToLinkedIn } = require('./linkedin.service');
const { publishToYouTube } = require('./youtube.service');
const twitterService = require('./twitter.service');
const { decrypt, encrypt } = require('./token.service');
const logger = require('../utils/logger');
const env = require('../config/env');

async function publishPost(postId) {
  // Get post with media + TikTok-specific options
  const [postRows] = await pool.execute(
    `SELECT id, content,
            tiktok_post_mode, tiktok_privacy_level,
            tiktok_disable_duet, tiktok_disable_stitch, tiktok_disable_comment,
            youtube_privacy, youtube_title, youtube_made_for_kids
       FROM posts WHERE id = ?`,
    [postId]
  );
  if (postRows.length === 0) throw new Error('Post not found');
  const post = postRows[0];

  // Get media files
  const [mediaRows] = await pool.execute(
    `SELECT m.* FROM media m
     JOIN post_media pm ON m.id = pm.media_id
     WHERE pm.post_id = ?
     ORDER BY pm.sort_order`,
    [postId]
  );

  const mediaFiles = mediaRows.map(m => ({
    id: m.id,
    filePath: m.file_path,
    mimeType: m.mime_type,
    originalName: m.original_name,
  }));

  // Get targets
  const [targets] = await pool.execute(
    `SELECT pt.id, pt.social_account_id, sa.id AS social_account_row_id,
            sa.platform, sa.platform_account_id, sa.access_token,
            sa.refresh_token, sa.token_expires_at
     FROM post_targets pt
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     WHERE pt.post_id = ? AND pt.status = 'pending'`,
    [postId]
  );

  if (targets.length === 0) {
    return { allSuccess: true, results: [] };
  }

  const results = [];
  let allSuccess = true;

  for (const target of targets) {
    try {
      let platformPostId;

      if (target.platform === 'facebook_page') {
        platformPostId = await publishToPage(
          target.platform_account_id,
          target.access_token,
          post.content,
          mediaFiles
        );
      } else if (target.platform === 'instagram_business') {
        const publicBaseUrl = env.igPublicBaseUrl || null;
        platformPostId = await publishToInstagram(
          target.platform_account_id,
          target.access_token,
          post.content,
          mediaFiles,
          publicBaseUrl
        );
        // IG treats any single-video post as a Reel (see instagram.service:
        // params.media_type = 'REELS'). Tag the post so dashboard widgets
        // that group by post_type put it in the Reel bucket instead of
        // "Photo or video".
        const onlyMedia = mediaFiles.length === 1 ? mediaFiles[0] : null;
        const isReel = onlyMedia && (onlyMedia.mimeType || onlyMedia.mime_type || '').startsWith('video/');
        if (isReel) {
          await pool.execute("UPDATE posts SET post_type = 'reel' WHERE id = ?", [postId]);
        }
      } else if (target.platform === 'linkedin') {
        platformPostId = await publishToLinkedIn(
          target.social_account_row_id,
          post.content,
          mediaFiles
        );
      } else if (target.platform === 'youtube') {
        platformPostId = await publishToYouTube(
          target.social_account_row_id,
          post.content,
          mediaFiles,
          {
            privacy: post.youtube_privacy || 'private',
            // Dedicated YouTube title (max 100 chars). Falls back to caption
            // first line if the user didn't set one.
            title: post.youtube_title || undefined,
            madeForKids: !!post.youtube_made_for_kids,
          }
        );
      } else if (target.platform === 'twitter') {
        // X / Twitter: text-only post via OAuth 2.0. Refresh the access
        // token first if it's expired (X access tokens last ~2h).
        let accessToken = decrypt(target.access_token);
        const expiresAt = target.token_expires_at ? new Date(target.token_expires_at).getTime() : 0;
        if (expiresAt && expiresAt < Date.now() + 60000 && target.refresh_token) {
          const refreshed = await twitterService.refreshAccessToken(decrypt(target.refresh_token));
          accessToken = refreshed.accessToken;
          const newExpires = refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null;
          await pool.execute(
            `UPDATE social_accounts SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?`,
            [encrypt(refreshed.accessToken), refreshed.refreshToken ? encrypt(refreshed.refreshToken) : null, newExpires, target.social_account_row_id]
          );
        }
        platformPostId = await twitterService.publishTweet(accessToken, post.content);
      } else if (target.platform === 'tiktok') {
        // TikTok returns a publish_id, not a platform post id — the post
        // finishes processing async on TikTok's side. We store the publish_id
        // in platform_post_id and a status checker can resolve the final
        // post URL later.
        platformPostId = await publishToTikTok(
          target.social_account_row_id,
          post.content,
          mediaFiles,
          {
            mode: post.tiktok_post_mode || 'INBOX',
            privacyLevel: post.tiktok_privacy_level || 'SELF_ONLY',
            disableDuet: !!post.tiktok_disable_duet,
            disableStitch: !!post.tiktok_disable_stitch,
            disableComment: !!post.tiktok_disable_comment,
          }
        );
      } else {
        throw new Error(`Unsupported platform: ${target.platform}`);
      }

      await pool.execute(
        "UPDATE post_targets SET status = 'published', platform_post_id = ?, published_at = NOW() WHERE id = ?",
        [platformPostId, target.id]
      );

      results.push({ targetId: target.id, platform: target.platform, success: true, platformPostId });
      logger.info(`Post ${postId}: published to ${target.platform} (${target.platform_account_id})`);
    } catch (err) {
      allSuccess = false;
      // Surface the real Graph API error body if available — that's what tells us *why* it failed.
      const apiError = err.response?.data?.error;
      const detail = apiError
        ? `${apiError.message || apiError.type || ''} ${apiError.error_user_msg ? '— ' + apiError.error_user_msg : ''} (code=${apiError.code}/${apiError.error_subcode || '-'})`.trim()
        : err.message;

      await pool.execute(
        "UPDATE post_targets SET status = 'failed', error_message = ? WHERE id = ?",
        [detail.slice(0, 500), target.id]
      );
      results.push({ targetId: target.id, platform: target.platform, success: false, error: detail });
      logger.error(`Post ${postId}: failed to publish to ${target.platform}: ${detail}`, {
        responseBody: err.response?.data,
        status: err.response?.status,
      });
    }
  }

  return { allSuccess, results };
}

module.exports = { publishPost };
