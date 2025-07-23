import mammoth from "mammoth";
import mime from "mime-types";
import path from "path";

// Convert .docx → .md, preserve .txt/.md/.pdf
export async function convertFileBuffer(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const baseName = path.basename(file.originalname, ext);

  if (ext === ".docx") {
    const result = await mammoth.convertToMarkdown({ buffer: file.buffer });
    const markdownBuffer = Buffer.from(result.value, "utf-8");

    return {
      data: markdownBuffer,
      filename: `${baseName}.md`,
      mimeType: "text/markdown",
    };
  }

  if ([".txt", ".md", ".pdf"].includes(ext)) {
    const mimeType = mime.lookup(ext) || "application/octet-stream";

    return {
      data: file.buffer,
      filename: file.originalname,
      mimeType,
    };
  }

  return {
    data: file.buffer,
    filename: file.originalname,
    mimeType: "application/octet-stream",
  };
}
