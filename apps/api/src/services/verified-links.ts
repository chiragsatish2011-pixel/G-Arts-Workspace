import { z } from "zod";

/** Evidence links are deliberately https-only; a URL field must not become a
 * redirect into an executable or insecure scheme. */
export const httpsUrl = z.string().url().refine((value) => /^https:\/\//i.test(value), "Use a secure https link");
