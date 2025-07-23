import { v4 as uuidv4 } from "uuid";
import { sendInviteEmail } from "../utils/email.js";
import pool from "../../db.js";
import bcrypt from "bcrypt";

// Send Invite ----------------------------------------------------------------------------------------------------------

export async function sendInvite(req, res) {
  const { email } = req.body;
  const role = "Member";
  const sent_by = req.user.sub;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    // 1️⃣ Fetch seat limit of this admin
    const seatLimitRes = await pool.query(
      `SELECT seat_limit FROM users WHERE id = $1`,
      [sent_by]
    );
    const SEAT_LIMIT = seatLimitRes.rows[0]?.seat_limit || 5;

    // 2️⃣ Count current members (excluding owner)
    const usedRes = await pool.query(
      `
      SELECT COUNT(*) AS used
      FROM user_workspace
      WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE owner_id = $1
      ) AND user_id != $1
      `,
      [sent_by]
    );
    const used = parseInt(usedRes.rows[0].used, 10);

    // 3️⃣ Count active pending invites
    const pendingRes = await pool.query(
      `
      SELECT COUNT(*) AS pending
      FROM invites
      WHERE sent_by = $1 AND used = FALSE AND expires_at > NOW()
      `,
      [sent_by]
    );
    const pending = parseInt(pendingRes.rows[0].pending, 10);

    const total = used + pending;
    if (total >= SEAT_LIMIT) {
      return res
        .status(403)
        .json({ message: `Seat limit reached (${SEAT_LIMIT} users)` });
    }

    // 4️⃣ Fetch one workspace ID to store (for tracking)
    const wsRes = await pool.query(
      `SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1`,
      [sent_by]
    );
    if (wsRes.rowCount === 0) {
      return res.status(400).json({ message: "No workspaces found for admin" });
    }

    const workspace_id = wsRes.rows[0].id;
    const token = uuidv4().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // 5️⃣ Store invite
    await pool.query(
      `
      INSERT INTO invites (email, workspace_id, token, expires_at, role, sent_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [email, workspace_id, token, expiresAt, role, sent_by]
    );

    const link = `http://localhost:5173/accept-invite?token=${token}`;
    await sendInviteEmail(email, link);

    res.status(200).json({ message: "Invite sent successfully" });
  } catch (err) {
    console.error("Error sending invite:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Accept Invite -------------------------------------------------------------------------------------------------------

export async function acceptInvite(req, res) {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: "Missing token or password" });
  }

  try {
    // 1️⃣ Validate invite
    const inviteRes = await pool.query(
      `SELECT * FROM invites WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [token]
    );
    if (inviteRes.rowCount === 0) {
      return res.status(400).json({ message: "Invalid or expired invite" });
    }
    const invite = inviteRes.rows[0];

    // 2️⃣ Create user
    const hashedPassword = await bcrypt.hash(password, 12);
    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3) RETURNING id`,
      [invite.email, hashedPassword, invite.role]
    );
    const userId = userRes.rows[0].id;

    // 3️⃣ Get all workspaces of the admin who sent the invite
    const workspacesRes = await pool.query(
      `SELECT id FROM workspaces WHERE owner_id = $1`,
      [invite.sent_by]
    );

    // 4️⃣ Link user to all workspaces
    for (const ws of workspacesRes.rows) {
      await pool.query(
        `INSERT INTO user_workspace (user_id, workspace_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, ws.id]
      );
    }

    // 5️⃣ Mark invite as used
    await pool.query(`UPDATE invites SET used = TRUE WHERE id = $1`, [
      invite.id,
    ]);

    return res
      .status(201)
      .json({ message: "User registered and linked to all workspaces." });
  } catch (err) {
    console.error("Accept Invite Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// Get all sent invites ------------------------------------------------------------------------------------------------

export async function getAllSentInvites(req, res) {
  const userId = req.user.sub;

  try {
    const result = await pool.query(
      `
      SELECT id, email, role, used, expires_at, created_at, workspace_id
      FROM invites
      WHERE sent_by = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    const invites = result.rows.map((invite) => {
      const now = new Date();
      const expired = new Date(invite.expires_at) < now;
      let status = "Pending";
      if (invite.used) status = "Accepted";
      else if (expired) status = "Expired";

      return {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status,
        sentAt: invite.created_at,
        workspaceId: invite.workspace_id,
      };
    });

    return res.json(invites);
  } catch (err) {
    console.error("Error fetching all sent invites:", err);
    res.status(500).json({ message: "Server error" });
  }
}

// Delete invite

export async function deleteInvite(req, res) {
  const inviteId = parseInt(req.params.inviteId);
  const userId = req.user.sub; // ID of the user making the request

  try {
    // Step 1: Verify the invite exists and was sent by the current user
    const result = await pool.query(
      `SELECT * FROM invites WHERE id = $1 AND sent_by = $2`,
      [inviteId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Invite not found or you are not authorized to delete it",
      });
    }

    // Step 2: Delete the invite
    await pool.query(`DELETE FROM invites WHERE id = $1`, [inviteId]);

    return res.status(200).json({ message: "Invite deleted successfully" });
  } catch (err) {
    console.error("Error deleting invite:", err);
    return res.status(500).json({ message: "Server error" });
  }
}
