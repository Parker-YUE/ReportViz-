const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getDB() {
  if (_client) return _client;
  _client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  return _client;
}

module.exports = { getDB };
