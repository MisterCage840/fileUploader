const express = require("express")
const multer = require("multer")
const crypto = require("node:crypto")

const { prisma } = require("../lib/prisma")
const { requireAuth } = require("../lib/middleware")
const { supabase, bucket } = require("../lib/supabase")

const router = express.Router()

// Validation rules
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
])

// Multer memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("File type not allowed"))
    }
    cb(null, true)
  },
})

// helper to avoid weird filenames in paths
function sanitizeFilename(name) {
  return String(name).replace(/[^\w.\-() ]+/g, "_")
}

/**
 * Upload file to Supabase and create DB record.
 */
router.post(
  "/folders/:folderId/files",
  requireAuth,
  upload.single("file"),
  async (req, res, next) => {
    try {
      const folder = await prisma.folder.findFirst({
        where: { id: req.params.folderId, ownerId: req.user.id },
      })
      if (!folder) return res.status(404).send("Folder not found")

      if (!req.file) return res.status(400).send("No file uploaded")

      const fileId = crypto.randomUUID()
      const safeName = sanitizeFilename(req.file.originalname)

      const storagePath = `${req.user.id}/${folder.id}/${fileId}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        })

      if (uploadError) throw uploadError

      const created = await prisma.file.create({
        data: {
          id: fileId,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          storagePath,
          ownerId: req.user.id,
          folderId: folder.id,
        },
      })

      return res.redirect(`/files/${created.id}`)
    } catch (err) {
      next(err)
    }
  },
)

/**
 * File details
 */
router.get("/files/:id", requireAuth, async (req, res, next) => {
  try {
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: { folder: true },
    })

    if (!file) return res.status(404).send("File not found")
    res.render("files/show", { file })
  } catch (err) {
    next(err)
  }
})

/**
 * Create a signed URL and redirect.
 */
router.get("/files/:id/download", requireAuth, async (req, res, next) => {
  try {
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
    })

    if (!file) return res.status(404).send("File not found")

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(file.storagePath, 60)

    if (error) return res.status(500).send("Could not create download link")

    return res.redirect(data.signedUrl)
  } catch (err) {
    next(err)
  }
})

/**
 * GET /files/:id/delete
 * Confirm delete page (owner only)
 */
router.get("/files/:id/delete", requireAuth, async (req, res, next) => {
  try {
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: { folder: true },
    })

    if (!file) return res.status(404).send("File not found")

    res.render("files/delete", { file })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /files/:id/delete
 * Delete file from Supabase + DB (owner only)
 */
router.post("/files/:id/delete", requireAuth, async (req, res, next) => {
  try {
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
    })

    if (!file) return res.status(404).send("File not found")

    // 1) Remove from storage
    const { error: storageError } = await supabase.storage
      .from(bucket)
      .remove([file.storagePath])

    // If file missing in storage, still delete DB record (don’t block user)
    // but if it’s a real error, you may want to stop:
    if (storageError) {
      console.error("Supabase remove error:", storageError)
      // Optional: return res.status(500).send("Could not delete file from storage");
    }

    // 2) Remove from DB
    await prisma.file.delete({ where: { id: file.id } })

    // 3) Redirect back to folder
    return res.redirect(`/folders/${file.folderId}`)
  } catch (err) {
    next(err)
  }
})

module.exports = router
