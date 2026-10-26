// Shared hero gallery (Supabase). Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Netlify site env.
import { handleGallery } from "../../src/gallery.js";

export default (request) =>
  handleGallery(request, { url: Netlify.env.get("SUPABASE_URL")?.replace(/\/$/, ""), key: Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") });

export const config = { path: "/api/heroes" };
