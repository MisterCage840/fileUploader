const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const bucket = process.env.SUPABASE_BUCKET

module.exports = { supabase, bucket }
