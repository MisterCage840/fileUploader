const express = require("express")
const bcrypt = require("bcryptjs")
const passport = require("passport")
const { body, validationResult } = require("express-validator")
const { prisma } = require("../lib/prisma")

const router = express.Router()

router.get("/signup", (req, res) => res.render("auth/signup", { errors: [] }))

router.post(
  "/signup",
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).render("auth/signup", { errors: errors.array() })
    }

    const { email, password } = req.body

    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) {
      return res.status(400).render("auth/signup", {
        errors: [{ msg: "Email already exists" }],
      })
    }

    const hashed = await bcrypt.hash(password, 10)
    await prisma.user.create({ data: { email, password: hashed } })

    res.redirect("/login")
  }
)

router.get("/login", (req, res) => res.render("auth/login", { errors: [] }))

router.post(
  "/login",
  body("email").isEmail().normalizeEmail(),
  body("password").notEmpty(),
  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).render("auth/login", { errors: errors.array() })
    }

    passport.authenticate("local", {
      successRedirect: "/folders",
      failureRedirect: "/login",
    })(req, res, next)
  }
)

router.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err)
    req.session.destroy(() => res.redirect("/login"))
  })
})

module.exports = router
