require("dotenv").config()
const path = require("node:path")
const express = require("express")
const helmet = require("helmet")
const session = require("express-session")
const { PrismaSessionStore } = require("@quixo3/prisma-session-store")
console.log("app.js is running")

const { prisma } = require("./lib/prisma")
const { passport } = require("./lib/passport")

const authRoutes = require("./routes/auth")
const folderRoutes = require("./routes/folders")
const fileRoutes = require("./routes/files")
const shareRoutes = require("./routes/share")

const app = express()

app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"))

app.use(helmet())
app.use(express.static(path.join(__dirname, "public")))
app.use(express.urlencoded({ extended: false }))

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 1000 * 60 * 10,
    }),
  }),
)

app.use(passport.initialize())
app.use(passport.session())

app.use((req, res, next) => {
  res.locals.user = req.user || null
  next()
})

app.get("/", (req, res) => {
  if (!req.user) return res.redirect("/login")
  return res.redirect("/folders")
})

app.use(authRoutes)
app.use(folderRoutes)
app.use(fileRoutes)
app.use(shareRoutes)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).send("Server error")
})
console.log("About to start listening..")

const PORT = process.env.PORT || 3000

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on ${PORT}`)
})
