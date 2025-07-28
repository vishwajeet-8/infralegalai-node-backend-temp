import pool from "../../db.js";

export const saveExtraction = async (req, res) => {
  const { extractedResults, workspaceId, agent } = req.body;

  try {
    for (const result of extractedResults) {
      const { fileName, extractedData, usage, rawResponse } = result;

      await pool.query(
        `
        INSERT INTO extracted_data (file_name, extracted_data, usage, raw_response, workspace_id, agent)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          fileName,
          extractedData,
          usage || null,
          rawResponse,
          workspaceId,
          agent || "Unassigned",
        ]
      );
    }

    res.status(200).json({ message: "Data saved successfully" });
  } catch (error) {
    console.error("Error saving extracted data:", error);
    res.status(500).json({ error: "Failed to save extracted data" });
  }
};

export const extractedDataByWorkspace = async (req, res) => {
  const { workspaceId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, file_name, extracted_data, usage, created_at, agent
      FROM extracted_data
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      `,
      [workspaceId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching extracted data:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
};

export const extractedDataById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, file_name, extracted_data, usage, created_at, agent
      FROM extracted_data
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching item:", error);
    res.status(500).json({ error: "Failed to fetch item" });
  }
};
