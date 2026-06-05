import os
from dotenv import load_dotenv
from supabase import create_client
load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
r = sb.table("vinted_post_jobs").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
print(f"Deleted {len(r.data)} jobs")
