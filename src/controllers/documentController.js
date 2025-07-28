import dotenv from "dotenv";
dotenv.config();
import s3 from "../config/s3.js";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import pool from "../../db.js";
import { v4 as uuidv4 } from "uuid";
import { convertFileBuffer } from "../utils/convertFileBuffer.js";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { GoogleGenAI } = require("@google/genai");

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Helper: Write buffer to temp file
async function writeTempFile(converted) {
  const tmpPath = path.join(os.tmpdir(), `${uuidv4()}_${converted.filename}`);
  await fs.writeFile(tmpPath, converted.data);
  return tmpPath;
}

export const uploadDocument = async (req, res) => {
  const files = req.files;
  const { workspaceId } = req.body;
  const uploadedBy = req.user.sub;

  if (!files || files.length === 0 || !workspaceId) {
    return res.status(400).json({
      message: "Files and workspaceId are required",
    });
  }

  try {
    for (const file of files) {
      // Step 1: Convert
      const converted = await convertFileBuffer(file);
      // console.log("Converted:", {
      //   filename: converted.filename,
      //   mimeType: converted.mimeType,
      //   size: converted.data.length,
      // });

      // Step 2: Write temp file
      const tmpPath = await writeTempFile(converted);

      // Step 3: Upload to Gemini
      const geminiFile = await genAI.files.upload({
        file: tmpPath,
        config: { mimeType: converted.mimeType },
      });

      // Step 4: Wait for Gemini to process
      let state = geminiFile.state.name;
      while (state === "PROCESSING") {
        await new Promise((r) => setTimeout(r, 1000));
        const updated = await genAI.files.get({ name: geminiFile.name });
        state = updated.state.name;
      }

      // Step 5A: Upload converted file to S3
      const convertedKey = `workspace_${workspaceId}/converted/${uuidv4()}_${
        converted.filename
      }`;
      const convertedCommand = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: convertedKey,
        Body: converted.data,
        ContentType: converted.mimeType,
      });
      await s3.send(convertedCommand);

      // ✅ Step 5B: Upload original file to S3
      const originalKey = `workspace_${workspaceId}/original/${uuidv4()}_${
        file.originalname
      }`;
      const originalCommand = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: originalKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      });
      await s3.send(originalCommand);

      // Step 6: Save to PostgreSQL
      await pool.query(
        `INSERT INTO documents (
            workspace_id,
            uploaded_by,
            filename,
            s3_key_converted,
            s3_key_original,
            gemini_uri
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          workspaceId,
          uploadedBy,
          file.originalname,
          convertedKey,
          originalKey,
          geminiFile.name,
        ]
      );

      // Step 7: Clean up temp file
      await fs.remove(tmpPath);
    }

    return res.status(200).json({ message: "Upload & Gemini sync successful" });
  } catch (err) {
    console.error("Upload Error:", err);
    return res.status(500).json({ message: "Upload failed" });
  }
};

// GET /all-files/:workspaceId
export async function listFiles(req, res) {
  const { workspaceId } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, filename, s3_key_original, s3_key_converted, created_at
       FROM documents
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching files:", err);
    res.status(500).json({ message: "Server error" });
  }
}

// DELETE /files/:fileId
export async function deleteFile(req, res) {
  const { fileId } = req.params;

  try {
    const { rows } = await pool.query(
      `DELETE FROM documents
       WHERE id = $1
       RETURNING s3_key_original, s3_key_converted`,
      [fileId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "File not found" });
    }

    const { s3_key_original, s3_key_converted } = rows[0];

    const deleteCommands = [];

    if (s3_key_original) {
      deleteCommands.push(
        s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3_key_original,
          })
        )
      );
    }

    if (s3_key_converted) {
      deleteCommands.push(
        s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3_key_converted,
          })
        )
      );
    }

    await Promise.all(deleteCommands);

    res.json({ message: "File deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

// export async function getSignedUrlForFile(req, res) {
//    const key = req.params[0];
//   console.log(key);
//   try {
//     const command = new GetObjectCommand({
//       Bucket: process.env.AWS_BUCKET_NAME,
//       Key: key,
//     });

//     const url = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour expiration
//     res.json({ url });
//   } catch (err) {
//     console.error("Error generating signed URL:", err);
//     res.status(500).json({ message: "Error generating download URL" });
//   }
// }

export const getSignedUrlForFile = async (req, res) => {
  try {
    const { key } = req.query; // Get key from query parameter

    if (!key) {
      return res
        .status(400)
        .json({ message: "S3 key query parameter is required" });
    }

    const decodedKey = decodeURIComponent(key);
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: decodedKey,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ url });
  } catch (err) {
    console.error("Error generating signed URL:", err);
    res.status(500).json({
      message: "Error generating download URL",
      error: err.message,
    });
  }
};
