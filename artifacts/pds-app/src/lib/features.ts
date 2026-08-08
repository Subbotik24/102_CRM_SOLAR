/** Build-time feature gates. Production keeps files disabled until storage is verified. */
export const filesEnabled = import.meta.env.PROD
  ? import.meta.env.VITE_FILES_ENABLED === "true"
  : import.meta.env.VITE_FILES_ENABLED !== "false";
