const pool = require('../config/db');
const postService = require('../services/post.service');
const aiCaptionService = require('../services/ai_caption.service');
const tiktokPosting = require('../services/tiktok_posting.service');

async function list(req, res, next) {
  try {
    const { page, limit, status, teamId, createdBy, search, clientId, socialAccountId } = req.query;
    const result = await postService.listPosts({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      status,
      teamId: teamId ? parseInt(teamId, 10) : undefined,
      createdBy: createdBy ? parseInt(createdBy, 10) : undefined,
      search,
      clientId: clientId ? parseInt(clientId, 10) : undefined,
      socialAccountId: socialAccountId ? parseInt(socialAccountId, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const post = await postService.getPost(parseInt(req.params.id, 10));
    res.json(post);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const {
      title, content, postType, teamId, mediaIds, targetAccountIds,
      tiktokPostMode, tiktokPrivacyLevel,
      tiktokDisableComment, tiktokDisableDuet, tiktokDisableStitch,
      youtubePrivacy, youtubeTitle, youtubeMadeForKids,
      instagramFirstComment,
    } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    const post = await postService.createPost({
      title,
      content,
      postType,
      createdBy: req.user.userId,
      teamId,
      mediaIds,
      targetAccountIds,
      tiktokPostMode,
      tiktokPrivacyLevel,
      tiktokDisableComment,
      tiktokDisableDuet,
      tiktokDisableStitch,
      youtubePrivacy,
      youtubeTitle,
      youtubeMadeForKids,
      instagramFirstComment,
    });
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const post = await postService.updatePost(
      parseInt(req.params.id, 10),
      req.body,
      req.user.userId,
      req.user.role
    );
    res.json(post);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await postService.deletePost(parseInt(req.params.id, 10), req.user.userId, req.user.role);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    next(err);
  }
}

async function submitForApproval(req, res, next) {
  try {
    const post = await postService.submitForApproval(parseInt(req.params.id, 10), req.user.userId);
    res.json(post);
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const post = await postService.approvePost(parseInt(req.params.id, 10), req.user.userId, req.body?.note);
    res.json(post);
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const post = await postService.rejectPost(parseInt(req.params.id, 10), req.user.userId, req.body?.note);
    res.json(post);
  } catch (err) {
    next(err);
  }
}

async function schedule(req, res, next) {
  try {
    const scheduledAt = req.body?.scheduledAt;
    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt is required' });
    }
    const post = await postService.schedulePost(
      parseInt(req.params.id, 10),
      scheduledAt,
      req.user.userId,
      req.user.role
    );
    res.json(post);
  } catch (err) {
    next(err);
  }
}

async function publishNow(req, res, next) {
  try {
    const post = await postService.publishNow(parseInt(req.params.id, 10), req.user.userId, req.user.role);
    res.json(post);
  } catch (err) {
    next(err);
  }
}

async function stats(req, res, next) {
  try {
    const data = await postService.getStats();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// Asks TikTok how a previously-initiated publish is going. The publish_id
// is what we stored in post_targets.platform_post_id at init time.
async function refreshTiktokTargetStatus(req, res, next) {
  try {
    const targetId = parseInt(req.params.targetId, 10);
    const [rows] = await pool.execute(
      `SELECT pt.id, pt.platform_post_id, pt.status, pt.error_message,
              sa.id AS social_account_id, sa.platform
         FROM post_targets pt
         JOIN social_accounts sa ON pt.social_account_id = sa.id
        WHERE pt.id = ?`,
      [targetId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post target not found' });
    }
    const t = rows[0];
    if (t.platform !== 'tiktok') {
      return res.status(400).json({ error: 'Target is not a TikTok publish' });
    }
    if (!t.platform_post_id) {
      return res.status(400).json({ error: 'No publish_id stored for this target' });
    }

    const accessToken = await tiktokPosting.ensureFreshAccessToken(t.social_account_id);
    const status = await tiktokPosting.getPublishStatus(accessToken, t.platform_post_id);

    // Map TikTok's lifecycle to our local target.status when terminal:
    //   PUBLISH_COMPLETE  -> keep 'published' (already set at init)
    //   FAILED            -> mark 'failed', persist reason
    //   PROCESSING_*      -> leave as-is, return the raw status to caller
    if (status?.status === 'FAILED') {
      const reason = status?.fail_reason || status?.error?.message || 'TikTok reports FAILED';
      await pool.execute(
        `UPDATE post_targets SET status = 'failed', error_message = ? WHERE id = ?`,
        [String(reason).slice(0, 500), targetId]
      );
    }

    res.json({
      targetId,
      publishId: t.platform_post_id,
      localStatus: t.status,
      tiktokStatus: status?.status || null,
      publiclyAvailablePostId: status?.publicly_available_post_id || null,
      failReason: status?.fail_reason || null,
      uploadedBytes: status?.uploaded_bytes ?? null,
      raw: status,
    });
  } catch (err) {
    next(err);
  }
}

// Accept an array of post payloads and create them in one round trip.
// Each row is independent — a single failure doesn't roll back the
// successful ones, the response lists per-row results so the client
// can show which rows landed and which need fixing. Optional
// scheduledAt schedules + publishes through the normal publish job.
async function bulkCreate(req, res, next) {
  try {
    const { posts: rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'posts array is required' });
    }
    if (rows.length > 200) {
      return res.status(400).json({ error: 'Up to 200 posts per bulk request' });
    }
    const results = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      try {
        if (!r.content || !r.content.trim()) {
          results.push({ index: i, ok: false, error: 'content required' });
          continue;
        }
        const post = await postService.createPost({
          title: r.title,
          content: r.content,
          postType: r.postType,
          createdBy: req.user.userId,
          teamId: r.teamId,
          mediaIds: r.mediaIds,
          targetAccountIds: r.targetAccountIds,
          tiktokPostMode: r.tiktokPostMode,
          tiktokPrivacyLevel: r.tiktokPrivacyLevel,
          youtubePrivacy: r.youtubePrivacy,
          youtubeTitle: r.youtubeTitle,
          instagramFirstComment: r.instagramFirstComment,
        });
        if (r.scheduledAt) {
          await postService.schedulePost(post.id, r.scheduledAt);
        }
        results.push({ index: i, ok: true, postId: post.id });
      } catch (err) {
        results.push({ index: i, ok: false, error: err.message });
      }
    }
    const okCount = results.filter(r => r.ok).length;
    res.status(201).json({ ok: okCount, failed: results.length - okCount, results });
  } catch (err) {
    next(err);
  }
}

async function aiCaption(req, res, next) {
  try {
    const { prompt, platforms, tone } = req.body || {};
    const out = await aiCaptionService.generateCaption({
      prompt,
      platforms: Array.isArray(platforms) ? platforms : [],
      tone: tone || 'engaging',
    });
    res.json(out);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

module.exports = { list, get, create, update, remove, submitForApproval, approve, reject, schedule, publishNow, stats, refreshTiktokTargetStatus, aiCaption, bulkCreate };
