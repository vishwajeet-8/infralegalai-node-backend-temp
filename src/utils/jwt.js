import jws from "jws";
import dotenv from "dotenv";
dotenv.config();

const secret = process.env.JWT_SECRET; // keep this strong & private
const twentyFourHour = 60 * 60 * 24; // seconds

export function signAccessToken({ sub, role, workspaceId }) {
  const now = Math.floor(Date.now() / 1000);

  return jws.sign({
    header: { alg: "HS256", typ: "JWT" },
    payload: {
      sub, // subject = user id
      role, // 'Owner'
      workspaceId,
      iat: now, // issued‑at
      exp: now + twentyFourHour,
    },
    secret,
  });
}

export function verifyToken(token) {
  try {
    /* 1️⃣  Verify signature */
    const isValid = jws.verify(token, "HS256", secret);
    if (!isValid) return null;

    /* 2️⃣  Decode payload */
    const { payload } = jws.decode(token);
    // console.log(payload);
    // payload is a plain JSON string → parse it
    // const data = JSON.parse(payload);

    /* 3️⃣  Check expiration */
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now >= payload.exp) return null; // token expired

    return payload; // { sub, role, workspaceId, iat, exp }
  } catch (err) {
    return null; // malformed token
  }
}
