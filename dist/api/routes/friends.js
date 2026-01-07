import { Router } from 'express';
import { getDb, ensureFriendshipsTable } from '../lib/db';
const router = Router();
// Get friends
router.get('/', async (req, res) => {
    const sql = getDb();
    await ensureFriendshipsTable();
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ success: false, message: 'userId required' });
    }
    const result = await sql `
    SELECT 
      f.id,
      f.status,
      f.created_at,
      f.user_id,
      f.friend_id,
      CASE 
        WHEN f.user_id = ${userId} THEN u2.id
        ELSE u1.id
      END as friend_user_id,
      CASE 
        WHEN f.user_id = ${userId} THEN u2.username
        ELSE u1.username
      END as friend_username,
      CASE 
        WHEN f.user_id = ${userId} THEN u2.avatar
        ELSE u1.avatar
      END as friend_avatar,
      CASE 
        WHEN f.user_id = ${userId} THEN 'outgoing'
        ELSE 'incoming'
      END as request_direction
    FROM friendships f
    JOIN users u1 ON f.user_id = u1.id
    JOIN users u2 ON f.friend_id = u2.id
    WHERE f.user_id = ${userId} OR f.friend_id = ${userId}
    ORDER BY f.created_at DESC
  `;
    return res.json({ success: true, data: result });
});
// Send friend request / Accept / Reject
router.post('/', async (req, res) => {
    const sql = getDb();
    await ensureFriendshipsTable();
    const { userId, friendUsername, action, friendshipId } = req.body;
    if (!userId) {
        return res.status(400).json({ success: false, message: 'userId required' });
    }
    // Accept friend request
    if (action === 'accept') {
        await sql `
      UPDATE friendships SET status = 'accepted' WHERE id = ${friendshipId} AND friend_id = ${userId}
    `;
        return res.json({ success: true, message: 'Friend request accepted' });
    }
    // Reject friend request
    if (action === 'reject') {
        await sql `DELETE FROM friendships WHERE id = ${friendshipId} AND friend_id = ${userId}`;
        return res.json({ success: true, message: 'Friend request rejected' });
    }
    // Send friend request
    if (!friendUsername) {
        return res.status(400).json({ success: false, message: 'friendUsername required' });
    }
    const friendResult = await sql `
    SELECT id FROM users WHERE LOWER(username) = LOWER(${friendUsername})
  `;
    if (friendResult.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    const friendId = friendResult[0].id;
    if (friendId === parseInt(userId)) {
        return res.status(400).json({ success: false, message: 'Cannot add yourself' });
    }
    const existingResult = await sql `
    SELECT * FROM friendships 
    WHERE (user_id = ${userId} AND friend_id = ${friendId}) OR (user_id = ${friendId} AND friend_id = ${userId})
  `;
    if (existingResult.length > 0) {
        return res.status(400).json({ success: false, message: 'Friend request already exists' });
    }
    await sql `INSERT INTO friendships (user_id, friend_id, status) VALUES (${userId}, ${friendId}, 'pending')`;
    return res.status(201).json({ success: true, message: 'Friend request sent' });
});
// Remove friend
router.delete('/', async (req, res) => {
    const sql = getDb();
    const { friendshipId, userId } = req.body;
    if (!friendshipId || !userId) {
        return res.status(400).json({ success: false, message: 'friendshipId and userId required' });
    }
    await sql `
    DELETE FROM friendships WHERE id = ${friendshipId} AND (user_id = ${userId} OR friend_id = ${userId})
  `;
    return res.json({ success: true, message: 'Friend removed' });
});
export default router;
