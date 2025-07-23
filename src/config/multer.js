import multer from "multer";
import multerS3 from "multer-s3";
import s3 from "./s3.js";

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME,
    // acl: "public-read",
    key: (req, file, cb) => {
      cb(null, `profile-images/${Date.now()}-${file.originalname}`);
    },
  }),
});

export default upload;
