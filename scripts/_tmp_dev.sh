#!/bin/sh
# Dev server with the public Supabase keys withheld, so SignInGate takes its
# demo path and renders the room. Every /api call is intercepted by the
# screenshot script anyway.
unset NEXT_PUBLIC_SUPABASE_URL
unset NEXT_PUBLIC_SUPABASE_ANON_KEY
exec npx next dev -p 3188
