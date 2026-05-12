const postService = require('../services/post.service');

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
    const { title, content, postType, teamId, mediaIds, targetAccountIds } = req.body;
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

module.exports = { list, get, create, update, remove, submitForApproval, approve, reject, schedule, publishNow, stats };
