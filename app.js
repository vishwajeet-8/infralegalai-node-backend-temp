import express from "express";
import cors from "cors";

import authRoutes from "./src/routes/authRoutes.js";
import inviteRoutes from "./src/routes/inviteRoutes.js";
import workspaceRoutes from "./src/routes/workspaceRoutes.js";
import documentRoutes from "./src/routes/documentRoutes.js";
import researchRoutes from "./src/routes/researchRoutes.js";
import extractionRoutes from "./src/routes/extractionRoutes.js";

const app = express();

// ✅ CORS must be first
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ then express.json
app.use(express.json());

// ✅ then routes
app.use("/legal-api", authRoutes);
app.use("/legal-api", inviteRoutes);
app.use("/legal-api", workspaceRoutes);
app.use("/legal-api", documentRoutes);
app.use("/legal-api", researchRoutes);
app.use("/legal-api", extractionRoutes);

export default app;
