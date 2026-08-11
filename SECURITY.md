# Security

- Use HTTPS in deployment and a strong, unique JWT secret.
- Hash passwords with bcrypt.
- Authorize on the API for every protected operation.
- Require `confirm: true` for destructive or privilege-changing operations.
- Soft-delete business records rather than hard-deleting them.
- Retain audit records only for consequential administrative actions.
- Do not collect behavioural telemetry or personal activity data.


## Uploads

- Profile pictures and chat attachments are stored under opaque keys and served
  only to a signed-in member; there is no public path to guess.
- A declared content type is treated as a hint. Anything rendered inline has its
  magic bytes verified, so an executable cannot masquerade as an image.
- Programs and installers are refused by extension and by media type.
- Replacing a profile picture deletes the previous file rather than accumulating
  every photo a member has ever had.
