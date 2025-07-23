import pool from "../../db.js";

export const getFollowedCases = async (req, res) => {
  const { workspaceId } = req.query;

  if (!workspaceId) {
    return res
      .status(400)
      .json({ success: false, error: "workspaceId is required" });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM followed_cases WHERE workspace_id = $1 ORDER BY followed_at DESC`,
      [workspaceId]
    );
    res.json({ success: true, cases: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getFollowedCasesByCourt = async (req, res) => {
  const { court, workspaceId } = req.query;

  if (!court || !workspaceId) {
    return res
      .status(400)
      .json({ success: false, error: "court and workspaceId are required" });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM followed_cases WHERE court = $1 AND workspace_id = $2 ORDER BY followed_at DESC`,
      [court, workspaceId]
    );
    res.json({ success: true, cases: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const followCase = async (req, res) => {
  const {
    case_id,
    cnr,
    title,
    case_number,
    diary_number,
    petitioner,
    respondent,
    status,
    court,
    followed_at,
    details,
    workspace_id,
  } = req.body;

  if (!court || !workspace_id) {
    return res
      .status(400)
      .json({ success: false, error: "Court and workspace_id are required" });
  }

  try {
    await pool.query(
      `INSERT INTO followed_cases
       (case_id, cnr, title, case_number, diary_number, petitioner, respondent, status, court, followed_at, details, workspace_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        case_id,
        cnr,
        title,
        case_number,
        diary_number,
        petitioner,
        respondent,
        status,
        court,
        followed_at || new Date(),
        details ? JSON.stringify(details) : null,
        workspace_id,
      ]
    );

    res.json({ success: true, message: "Case followed successfully" });
  } catch (error) {
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ success: false, error: "Case is already followed" });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const unfollowCase = async (req, res) => {
  const { caseId } = req.body;

  if (!caseId) {
    return res
      .status(400)
      .json({ success: false, error: "caseId is required" });
  }

  try {
    const result = await pool.query(
      `DELETE FROM followed_cases WHERE case_id = $1`,
      [caseId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: "Case not found" });
    }

    res.json({ success: true, message: "Case unfollowed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
