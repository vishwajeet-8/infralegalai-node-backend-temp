import { verifyToken } from "../utils/jwt.js";

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  // console.log(token);

  const user = verifyToken(token);
  // console.log(user);

  if (!user) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  req.user = user; // contains: sub, role, workspaceId
  next();
}
