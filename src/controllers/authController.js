import pool from "../../db.js";
import { sendInviteEmail } from "../utils/email.js";
import { comparePassword, hashPassword } from "../utils/hash.js";
import { signAccessToken } from "../utils/jwt.js";
import { v4 as uuidv4 } from "uuid";

// Create Admin ----------------------------------------------------------------------------------------------------
export const createAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email & password are required" });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Check for duplicate user
    const { rowCount: exists } = await client.query(
      "SELECT 1 FROM users WHERE email = $1",
      [email]
    );
    if (exists) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "User already exists" });
    }

    // 2️⃣ Create user (Owner) with hashed password & seat limit
    const hashed = await hashPassword(password);
    const createUserQuery = `
      INSERT INTO users (email, password_hash, role, seat_limit)
      VALUES ($1, $2, 'Owner', 5)
      RETURNING id
    `;
    const {
      rows: [{ id: userId }],
    } = await client.query(createUserQuery, [email, hashed]);

    // 3️⃣ Create default workspace
    const createWorkspaceQuery = `
      INSERT INTO workspaces (name, owner_id, is_default)
      VALUES ('Default Workspace', $1, TRUE)
      RETURNING id
    `;
    const {
      rows: [{ id: workspaceId }],
    } = await client.query(createWorkspaceQuery, [userId]);

    // 4️⃣ Link user to their default workspace
    await client.query(
      `INSERT INTO user_workspace (user_id, workspace_id) VALUES ($1, $2)`,
      [userId, workspaceId]
    );

    await client.query("COMMIT");

    // 5️⃣ Return JWT
    const token = signAccessToken({
      sub: userId,
      role: "Owner",
      workspaceId,
    });

    res.status(201).json({
      message: "Admin & default workspace created successfully",
      token,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create Admin Error:", err);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
};

// Login -------------------------------------------------------------------------------------------------------------------
export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  try {
    const {
      rows: [user],
    } = await pool.query(
      "SELECT id, email, password_hash, role FROM users WHERE email = $1",
      [email]
    );

    if (!user)
      return res.status(401).json({ message: "Invalid email or password" });

    const valid = await comparePassword(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ message: "Invalid email or password" });

    const {
      rows: [workspace],
    } = await pool.query(
      `SELECT workspace_id
     FROM user_workspace
    WHERE user_id = $1
    LIMIT 1`,
      [user.id]
    );

    const workspaceId = workspace?.workspace_id;

    // 🏷️ Include workspaceId in token
    const token = signAccessToken({
      sub: user.id,
      role: user.role,
      workspaceId, // 👈 added here
    });

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        workspaceId, // optionally return here too
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// Request reset password -----------------------------------------------------------------------------------------------
export async function requestPasswordReset(req, res) {
  const { email } = req.body;

  const userCheck = await pool.query(`SELECT id FROM users WHERE email = $1`, [
    email,
  ]);
  if (userCheck.rows.length === 0) {
    return res
      .status(200)
      .json({ message: "If user exists, a reset link has been sent." }); // avoid email leaks
  }

  const token = uuidv4().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  await pool.query(
    `
    INSERT INTO password_resets (email, token, expires_at)
    VALUES ($1, $2, $3)
  `,
    [email, token, expiresAt]
  );

  const resetLink = `http://localhost:5173/reset-password?token=${token}`;
  await sendInviteEmail(email, resetLink);

  return res.json({ message: "Reset link sent." });
}

// Reset Password -------------------------------------------------------------------------------------------
export async function resetPassword(req, res) {
  const { token, newPassword } = req.body;

  const resetRow = await pool.query(
    `
    SELECT * FROM password_resets
    WHERE token = $1 AND used = FALSE AND expires_at > NOW()
  `,
    [token]
  );

  if (resetRow.rows.length === 0) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  const { email } = resetRow.rows[0];

  const hashed = await hashPassword(newPassword);

  // Update user's password
  await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [
    hashed,
    email,
  ]);

  // Mark token as used
  await pool.query(`UPDATE password_resets SET used = TRUE WHERE token = $1`, [
    token,
  ]);

  return res.json({ message: "Password reset successful" });
}

// Get All users --------------------------------------------------------------------------------------------------------
export async function getAllUsers(req, res) {
  const role = req.user.role;

  if (role !== "Owner") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, role, created_at FROM users ORDER BY created_at DESC`
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Server error" });
  }
}

// specific user ---------------------------------------------------------------------------------------------------------
// export async function getUserDetails(req, res) {
//   try {
//     const userId = req.user.sub; // Set by your auth middleware

//     const { rows } = await pool.query(
//       `SELECT id, email, role, created_at FROM users WHERE id = $1`,
//       [userId]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     res.json(rows[0]);
//   } catch (err) {
//     console.error("Error fetching user details:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// }

export async function getUserDetails(req, res) {
  try {
    const userId = req.user.sub;

    const { rows } = await pool.query(
      `SELECT id, email, role, name, profile_picture, created_at FROM users WHERE id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];

    const s3BaseUrl = "https://legal-ai-uploads.s3.amazonaws.com"; // replace with your actual bucket
    user.profile_picture_url = user.profile_picture
      ? `${s3BaseUrl}/${user.profile_picture}`
      : null;

    res.json(user);
  } catch (err) {
    console.error("Error fetching user details:", err);
    res.status(500).json({ message: "Server error" });
  }
}

// Updated User -----------------------------------------------------------------------------------------------
// PATCH /user/profile

export async function updateUserProfile(req, res) {
  const userId = req.user.sub;
  const { name } = req.body;
  const photoKey = req.file?.key; // assuming multer-S3 handles this

  try {
    const query = `
      UPDATE users
      SET name = COALESCE($1, name),
          profile_picture = COALESCE($2, profile_picture)
      WHERE id = $3
      RETURNING id, email, role, name, profile_picture, created_at;
    `;
    const values = [name || null, photoKey || null, userId];

    const { rows } = await pool.query(query, values);
    return res.json(rows[0]);
  } catch (err) {
    console.error("Profile update error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// Delete User ----------------------------------------------------------------------------------------------------

export async function deleteUser(req, res) {
  const userIdToDelete = req.params.userId;
  const requesterId = req.user.sub;
  const requesterRole = req.user.role;

  try {
    if (requesterId !== userIdToDelete && requesterRole !== "Owner") {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this user." });
    }

    // Begin transaction
    await pool.query("BEGIN");

    // Step 1: Delete from user_workspace
    await pool.query(`DELETE FROM user_workspace WHERE user_id = $1`, [
      userIdToDelete,
    ]);

    // Step 2: Delete from invites (if they were invited or sent invites)
    await pool.query(
      `DELETE FROM invites WHERE email = (SELECT email FROM users WHERE id = $1)`,
      [userIdToDelete]
    );
    await pool.query(`DELETE FROM invites WHERE sent_by = $1`, [
      userIdToDelete,
    ]);

    // Step 3: Delete from sessions / activity / logs if applicable
    // Example: await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userIdToDelete]);

    // Step 4: Delete from other related tables (extend this based on your app schema)
    // Example:
    // await pool.query(`DELETE FROM comments WHERE user_id = $1`, [userIdToDelete]);
    // await pool.query(`DELETE FROM documents WHERE created_by = $1`, [userIdToDelete]);

    // Step 5: Finally delete the user
    await pool.query(`DELETE FROM users WHERE id = $1`, [userIdToDelete]);

    // Commit transaction
    await pool.query("COMMIT");

    return res
      .status(200)
      .json({ message: "User and related data deleted successfully." });
  } catch (err) {
    console.error("Error deleting user:", err);
    await pool.query("ROLLBACK");
    return res.status(500).json({ message: "Server error during deletion." });
  }
}
