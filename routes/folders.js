const express = require("express")
const { body, validationResult } = require("express-validator")
const { prisma } = require("../lib/prisma")
const { requireAuth } = require("../lib/middleware")

const router = express.Router()

router.get("/folders", requireAuth, async (req, res, next) => {
  try {
    const folders = await prisma.folder.findMany({
      where: { ownerId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { files: true } } },
    })

    res.render("folders/index", { folders })
  } catch (err) {
    next(err)
  }
})

router.get("/folders/new", requireAuth, (req, res) => {
  res.render("folders/new", { errors: [], values: { name: "" } })
})

router.post(
  "/folders",
  requireAuth,
  body("name")
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage("Folder name must be 1–80 characters."),
  async (req, res, next) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).render("folders/new", {
          errors: errors.array(),
          values: { name: req.body.name || "" },
        })
      }

      await prisma.folder.create({
        data: {
          name: req.body.name,
          ownerId: req.user.id,
        },
      })

      res.redirect("/folders")
    } catch (err) {
      next(err)
    }
  },
)

router.get("/folders/:id", requireAuth, async (req, res, next) => {
  try {
    const folder = await prisma.folder.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: { files: { orderBy: { createdAt: "desc" } } },
    })

    if (!folder) return res.status(404).send("Folder not found")
    res.render("folders/show", { folder })
  } catch (err) {
    next(err)
  }
})

router.get("/folders/:id/edit", requireAuth, async (req, res, next) => {
  try {
    const folder = await prisma.folder.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
    })

    if (!folder) return res.status(404).send("Folder not found")

    res.render("folders/edit", {
      folder,
      errors: [],
      values: { name: folder.name },
    })
  } catch (err) {
    next(err)
  }
})

router.post(
  "/folders/:id/edit",
  requireAuth,
  body("name")
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage("Folder name must be 1–80 characters."),
  async (req, res, next) => {
    try {
      const folder = await prisma.folder.findFirst({
        where: { id: req.params.id, ownerId: req.user.id },
      })

      if (!folder) return res.status(404).send("Folder not found")

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).render("folders/edit", {
          folder,
          errors: errors.array(),
          values: { name: req.body.name || "" },
        })
      }

      await prisma.folder.update({
        where: { id: folder.id },
        data: { name: req.body.name },
      })

      res.redirect(`/folders/${folder.id}`)
    } catch (err) {
      next(err)
    }
  },
)

/**
 * POST /folders/:id/delete
 * Delete folder + all files
 */
router.post("/folders/:id/delete", requireAuth, async (req, res, next) => {
  try {
    const folder = await prisma.folder.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: { files: true },
    })

    if (!folder) return res.status(404).send("Folder not found")

    // delete files from storage
    if (folder.files.length) {
      const paths = folder.files.map((f) => f.storagePath)
      await supabase.storage.from(bucket).remove(paths)
    }

    // delete folder (cascade deletes files if schema is set)
    await prisma.folder.delete({ where: { id: folder.id } })

    res.redirect("/folders")
  } catch (err) {
    next(err)
  }
})

/**
 * GET /folders/:id/delete
 * Confirm folder deletion
 */
router.get("/folders/:id/delete", requireAuth, async (req, res, next) => {
  try {
    const folder = await prisma.folder.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: { files: true },
    })

    if (!folder) return res.status(404).send("Folder not found")

    res.render("folders/delete", { folder })
  } catch (err) {
    next(err)
  }
})

module.exports = router
