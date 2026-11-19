# Environment variables (Vercel -> Project -> Settings -> Environment Variables)

Existing M-Pesa ones stay as they are.

New:
| Name                  | Value                                                        |
|-----------------------|--------------------------------------------------------------|
| SUPABASE_URL          | Supabase -> Project Settings -> API -> Project URL           |
| SUPABASE_SERVICE_KEY  | Same page -> service_role key (SECRET)                       |
| ADMIN_PASSWORD        | A long password of your choice for /admin                    |
| AT_USERNAME           | `sandbox` while testing; your real AT app username when live |
| AT_API_KEY            | Africa's Talking -> Settings -> API Key                      |
| AT_SENDER_ID          | Optional. Only after AT approves your sender ID              |

After adding them, redeploy.
