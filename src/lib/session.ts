import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";

/** The current session, or null. Cached per request, so several components can call it cheaply. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));
