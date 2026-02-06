const express = require("express")
const { body, validationResult } = require("express-validator")
const { prisma } = require("../lib/prisma")
const { requireAuth } = require("../lib/middleware")
const { supabase, bucket } = require("../lib/supabase")

const router = express.Router()

function parseDuration(input) {
  const s = String(input || "")
    .trim()
    .toLowerCase()
  const match = s.match(/^(\d+)\s*([dhm])$/)
  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2]

  if (!Number.isFinite(amount) || amount <= 0) return null

  let ms = 0
  if (unit === "d") ms = amount * 24 * 60 * 60 * 1000
  if (unit === "h") ms = amount * 60 * 60 * 1000
  if (unit === "m") ms = amount * 60 * 1000

  const maxMs = 30 * 24 * 60 * 60 * 1000
  if (ms > maxMs) ms = maxMs

  return ms
}

// Show share form for a folder
router.get("/folders/:id/share", requireAuth, async (req, res, next) => {
  try {
    const folder = await prisma.folder.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: {
        shares: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    })

    if (!folder) return res.status(404).send("Folder not found")

    const token = req.query.token || null

    // base url for copy (works on localhost + production)
    const baseUrl = `${req.protocol}://${req.get("host")}`

    res.render("folders/share", {
      folder,
      errors: [],
      values: { duration: "1d" },
      token,
      baseUrl,
      now: new Date(),
    })
  } catch (err) {
    next(err)
  }
})

// Create a share link
router.post(
  "/folders/:id/share",
  requireAuth,
  body("duration")
    .trim()
    .isLength({ min: 2, max: 10 })
    .withMessage("Duration is required (e.g. 1d, 6h, 30m)."),
  async (req, res, next) => {
    try {
      const folder = await prisma.folder.findFirst({
        where: { id: req.params.id, ownerId: req.user.id },
      })

      if (!folder) return res.status(404).send("Folder not found")

      const errors = validationResult(req)
      const ms = parseDuration(req.body.duration)

      if (!errors.isEmpty() || !ms) {
        return res.status(400).render("folders/share", {
          folder: { ...folder, shares: [] },
          errors: [
            {
              msg: "Invalid duration. Use formats like 1d, 6h, 30m (max 30d).",
            },
          ],
          values: { duration: req.body.duration || "" },
        })
      }

      const expiresAt = new Date(Date.now() + ms)

      const share = await prisma.shareLink.create({
        data: {
          expiresAt,
          folderId: folder.id,
          ownerId: req.user.id,
        },
      })

      return res.redirect(`/folders/${folder.id}/share?token=${share.id}`)
    } catch (err) {
      next(err)
    }
  },
)

// Public page for shared folder
router.get("/share/:token", async (req, res, next) => {
  try {
    const share = await prisma.shareLink.findUnique({
      where: { id: req.params.token },
      include: {
        folder: {
          include: {
            files: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    })

    if (!share) return res.status(404).send("Share link not found")

    if (new Date() > share.expiresAt) {
      return res.status(410).send("This share link has expired.")
    }

    res.render("folders/public", { share })
  } catch (err) {
    next(err)
  }
})

// Public download (server-generated signed URL)
router.get("/share/:token/files/:fileId/download", async (req, res, next) => {
  try {
    const share = await prisma.shareLink.findUnique({
      where: { id: req.params.token },
      include: { folder: true },
    })

    if (!share) return res.status(404).send("Share link not found")
    if (new Date() > share.expiresAt)
      return res.status(410).send("This share link has expired.")

    const file = await prisma.file.findFirst({
      where: { id: req.params.fileId, folderId: share.folderId },
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

module.exports = router
