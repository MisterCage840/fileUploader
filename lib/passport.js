const passport = require("passport")
const LocalStrategy = require("passport-local").Strategy
const bcrypt = require("bcryptjs")
const { prisma } = require("./prisma")

passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) return done(null, false)

        const ok = await bcrypt.compare(password, user.password)
        if (!ok) return done(null, false)

        return done(null, user)
      } catch (err) {
        return done(err)
      }
    }
  )
)

passport.serializeUser((user, done) => done(null, user.id))

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } })
    return done(null, user || false)
  } catch (err) {
    return done(err)
  }
})

module.exports = { passport }
