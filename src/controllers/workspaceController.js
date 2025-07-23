import pool from "../../db.js";

// Invite limit -----------------------------------------------------------------------------------------------------

export const getSeatUsage = async (req, res) => {
  const ownerId = req.user.sub;

  try {
    const result = await pool.query(
      `
      SELECT
        u.seat_limit,
        (
          -- Count distinct users (excluding owner) added to any of owner's workspaces
          SELECT COUNT(DISTINCT uw.user_id)
          FROM user_workspace uw
          WHERE uw.workspace_id IN (
            SELECT id FROM workspaces WHERE owner_id = $1
          )
          AND uw.user_id != $1
        ) +
        (
          -- Count pending invites
          SELECT COUNT(*)
          FROM invites
          WHERE sent_by = $1 AND used = false AND expires_at > NOW()
        ) AS used
      FROM users u
      WHERE u.id = $1
      `,
      [ownerId]
    );

    res.json(result.rows[0]); // { seat_limit, used }
  } catch (err) {
    console.error("Seat usage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Create Workspace -----------------------------------------------------------------------------------------------

export async function createWorkspace(req, res) {
  const { name } = req.body;
  const ownerId = req.user.sub;

  try {
    // 1. Create new workspace
    const result = await pool.query(
      `INSERT INTO workspaces (name, owner_id)
       VALUES ($1, $2)
       RETURNING id, name`,
      [name, ownerId]
    );
    const newWorkspace = result.rows[0];

    // 2. Link owner to this workspace
    await pool.query(
      `INSERT INTO user_workspace (user_id, workspace_id)
       VALUES ($1, $2)`,
      [ownerId, newWorkspace.id]
    );

    // 3. Get all non-owner users already linked to any of this owner's other workspaces
    const sharedUsers = await pool.query(
      `
      SELECT DISTINCT uw.user_id
      FROM user_workspace uw
      JOIN workspaces w ON uw.workspace_id = w.id
      WHERE w.owner_id = $1 AND uw.user_id != $1
      `,
      [ownerId]
    );

    // 4. Link those users to the new workspace
    const linkPromises = sharedUsers.rows.map((row) =>
      pool.query(
        `INSERT INTO user_workspace (user_id, workspace_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [row.user_id, newWorkspace.id]
      )
    );
    await Promise.all(linkPromises);

    return res.status(201).json({
      message: "Workspace created and shared with existing users.",
      workspace: newWorkspace,
    });
  } catch (err) {
    console.error("Create workspace error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

//Get all workspace ----------------------------------------------------------------------------------------------

export async function listUserWorkspaces(req, res) {
  const userId = req.user.sub;

  try {
    const result = await pool.query(
      `
      SELECT w.id, w.name, w.is_default, w.owner_id
      FROM workspaces w
      WHERE w.owner_id = $1
      
      UNION
      
      SELECT w.id, w.name, w.is_default, w.owner_id
      FROM workspaces w
      JOIN user_workspace uw ON w.id = uw.workspace_id
      WHERE uw.user_id = $1
      `,
      [userId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("List workspaces error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// Delete Workspace

export async function deleteWorkspace(req, res) {
  const userId = req.user.sub; // Extracted from token via authMiddleware
  const workspaceId = req.params.workspaceId;

  try {
    // Optional: Verify ownership before deletion
    const check = await pool.query(
      `SELECT * FROM workspaces WHERE id = $1 AND owner_id = $2`,
      [workspaceId, userId]
    );

    if (check.rows.length === 0) {
      return res
        .status(403)
        .json({ message: "Unauthorized or workspace not found" });
    }

    // Delete related documents
    await pool.query(`DELETE FROM documents WHERE workspace_id = $1`, [
      workspaceId,
    ]);

    // Delete related records (if you want full cleanup)
    await pool.query(`DELETE FROM user_workspace WHERE workspace_id = $1`, [
      workspaceId,
    ]);
    await pool.query(`DELETE FROM invites WHERE workspace_id = $1`, [
      workspaceId,
    ]);

    // Finally delete the workspace
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);

    return res.status(200).json({ message: "Workspace deleted successfully" });
  } catch (err) {
    console.error("Delete Workspace Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}
